# 智能剪辑平台 2.0 — LangGraph 端到端需求文档

> **范围**:Phase 2 收尾已落定(commit 1-4),Phase 3 改为"接入 `@langchain/langgraph` + 10 节点流水线 + Electron IPC 接线"。Phase 4(多档分辨率)留待后续。
>
> **起点状态**(本地 main 当前 5 commit ahead):
>
> - `4c80ed8` docs(plan): phase 2/3/4 旧 plan
> - `ed6afd3` chore: scaffold packages/video-{agent,project}
> - `b7ee0d5` feat(media): probeMedia + extractKeyframes(ffmpeg/ffprobe 包装层)
> - `1753557` feat(agent): MinimaxM3ModelProvider + describeFrames
> - `e36f6bf` feat(agent): analyzeAssets step + IPC channel 脚手架
>
> **方法论**:本计划基于 `@langchain/langgraph` 设计模式,描述**算法流程**和**字段约定**,不依赖任何特定上游实现。

---

## 0. Context

旧 plan 把"三个 Agent"(quality_scoring / auto_bgm / beat_cut)列为 Phase 3 主任务,实地分析后发现:

- LangGraph 主流形态是 **10 节点线性流水线**(scan / analyze / brief / plan / approval / match / voice / assemble / validate / save),`agents/` 目录不属于标准模式
- `silencedetect` / `beat_cut` 是剪映类产品的可选项,不一定要做
- 真实形态是 **LangGraph `interrupt()` + `Command({ resume })` 模拟 human-in-the-loop**,不是普通 await 流水线
- Electron 主进程通过 `event.sender.send('videoAgent:event', ...)` per-invoke 闭包把 LangGraph `AgentRunEvent` 推给渲染层,**单一 event 流**而非多 channel 分立
- `saveProject` 走 `validate → mkdir → writeFile .json → Result` 形态,落盘在 `userData/projects/`

新需求:把 LangGraph 形态接入本仓,端到端打通"视频目录 → 真分镜确认 → 真项目落盘",并补齐本仓 commit 4 留下的 IPC 接线缺口。

---

## 1. 整体架构

```
                    ┌──────────────────────────────────────────┐
                    │      Electron Renderer (React)           │
                    │  - Workspace / Create / Editor / Export  │
                    │  - miaomaAPI.videoAgent.onEvent(...)      │
                    └────────────────────┬─────────────────────┘
                                         │ ipcRenderer.invoke / .on
                                         ▼
                    ┌──────────────────────────────────────────┐
                    │   Electron Preload + IPC Channel         │
                    │   apps/desktop/client/{preload,          │
                    │   video-agent-ipc}.ts                    │
                    │   shared/ipc.ts(channel + 类型)          │
                    └────────────────────┬─────────────────────┘
                                         │ ipcMain.handle + sender.send
                                         ▼
                    ┌──────────────────────────────────────────┐
                    │      Video Agent Controller              │
                    │  - runId 状态表 + emit 路由              │
                    │  - 调用 createVideoCreationGraph         │
                    └────────────────────┬─────────────────────┘
                                         │
                                         ▼
                    ┌──────────────────────────────────────────┐
                    │   @langchain/langgraph StateGraph        │
                    │   packages/video-agent/src/graph/        │
                    │   START → 9 节点 → END                   │
                    │   scene_approval 用 interrupt()          │
                    └────────────────────┬─────────────────────┘
                                         │
                                         ▼
                    ┌──────────────────────────────────────────┐
                    │     Tools (VideoAgentTools 接口)         │
                    │  - scanAssets / analyzeAssets / brief    │
                    │  - planScenes / matchAssets / voice      │
                    │  - assembleTimeline / validate / save    │
                    │  - ↑ 全部由 desktop 端注入(Node fs/ffmpeg/│
                    │    LLM provider/TTS provider)            │
                    └──────────────────────────────────────────┘
```

---

## 2. LangGraph State Schema(`packages/video-agent/src/graph/state.ts`)

用 `Annotation.Root()` 声明 10 个 field:

| field              | 类型                         | 来源节点          | 用途                                                               |
| ------------------ | ---------------------------- | ----------------- | ------------------------------------------------------------------ |
| `input`            | `VideoCreationInput`         | 初始              | 用户输入:prompt / runId / sourceAssetDirectory / selectedVoiceType |
| `runId`            | `string`                     | 初始              | 同时作为 LangGraph `configurable.thread_id`                        |
| `assets`           | `AssetAnalysis[]`            | scan → analyze    | 先是 `{assetId, filePath}[]` 骨架,analyze 节点覆写完整元数据       |
| `brief`            | `CreativeBrief \| undefined` | creative_brief    | LLM 产出 title/summary/audience/tone/keyMessages                   |
| `scenes`           | `PlannedScene[]`             | plan_scenes       | 分镜列表(sceneId / narration / visualBrief)                        |
| `matches`          | `AssetMatchResult[]`         | match_assets      | 每个 scene 匹配到的素材候选 + ranking                              |
| `voices`           | `VoiceSynthesisResult[]`     | synthesize_voice  | TTS 产物 mp3 路径 + durationMs                                     |
| `project`          | `VideoProject \| undefined`  | assemble_timeline | 完整时间线项目对象                                                 |
| `savedProjectPath` | `string \| undefined`        | save_project      | 落盘路径                                                           |
| `errors`           | `string[]`                   | 累积              | 用于最终失败结果反馈                                               |

辅助类型:

```ts
SceneApprovalRequest = { type: 'scene-plan', payload: { brief, scenes } };
SceneApprovalResume = { approved: boolean };
```

---

## 3. LangGraph Nodes(`packages/video-agent/src/graph/nodes.ts`)

10 个 node 工厂函数,签名 `(state) => Partial<State>`,统一通过 `createInstrumentedNode({ emit, nodeName, run })` 包装自动 emit `node.started / completed / failed` 事件:

| 节点 key            | 输入(state 字段)        | 输出(写回 state)                               | 本仓已有能力复用                               |
| ------------------- | ----------------------- | ---------------------------------------------- | ---------------------------------------------- |
| `scan_assets`       | `input`                 | `assets: AssetAnalysis[]`(仅 assetId+filePath) | 新写:`readdir` + 后缀过滤                      |
| `analyze_assets`    | `input, assets`         | `assets`(覆写完整 metadata + frames)           | commit 4 `analyzeAssets` 纯函数,加 node 适配层 |
| `creative_brief`    | `input, assets`         | `brief`                                        | 新写 prompt + M3 `generateText`                |
| `plan_scenes`       | `input, brief, assets`  | `scenes`                                       | 新写 prompt + M3 `generateText`                |
| `scene_approval`    | `brief, scenes`         | —(interrupt 等待)                              | LangGraph `interrupt<>()`                      |
| `match_assets`      | `input, scenes, assets` | `matches`                                      | 新写 prompt + 排序                             |
| `synthesize_voice`  | `input, brief, scenes`  | `voices`                                       | commit 1 `VolcengineTtsProvider`               |
| `assemble_timeline` | 全字段                  | `project`                                      | 新写纯函数                                     |
| `validate_project`  | `project`               | —(失败抛错)                                    | `VideoProjectSchema.parse` 二次校验            |
| `save_project`      | `project`               | `savedProjectPath`                             | desktop 端 `video-project-store.ts` 注入       |

**scene_approval 实现要点**(LangGraph 官方 `interrupt<>()` 用法):

```text
1. emit node.started
2. const resume = interrupt<SceneApprovalRequest, SceneApprovalResume>({
     type: 'scene-plan',
     payload: { brief: state.brief, scenes: state.scenes }
   })
3. if (resume.approved) emit node.completed → return {}
4. else throw new Error('Scene plan rejected')  // 驳回走抛错,外层重启
```

**驳回路径选择**(已定):走"抛错 + 外层重 start",简单。**不**用 `addConditionalEdges` + `Command({ goto })` 实现真回环。

---

## 4. 事件流(`packages/video-agent/src/events/`)

LangGraph discriminated union 事件模式,**本仓 commit 4 只声明了 2 种**(`status / log`),Phase 3 commit 6 要扩展到 13 种:

| 事件 type                     | 触发时机                      | 携带字段                             |
| ----------------------------- | ----------------------------- | ------------------------------------ |
| `run.started`                 | `start()` 入口                | runId                                |
| `node.started`                | 每个 node 入口                | runId, nodeKey                       |
| `node.completed`              | node 成功                     | runId, nodeKey, durationMs           |
| `node.failed`                 | node 抛错                     | runId, nodeKey, error                |
| `model.stream.started`        | LLM 开始 streaming            | runId, model                         |
| `model.stream.delta`          | LLM 每个 token                | runId, delta                         |
| `model.stream.completed`      | LLM 完成                      | runId, totalTokens                   |
| `model.delta`                 | 同上简化(短形式)              | runId, delta                         |
| `voice.regeneration.progress` | regenerate_voices 进度        | runId, current, total, percent       |
| **`approval.required`**       | scene_approval 触发 interrupt | runId, request: SceneApprovalRequest |
| `run.completed`               | 全部 10 节点跑完              | runId, projectId                     |
| `run.failed`                  | 任一 node 抛错                | runId, errors                        |
| `run.cancelled`               | 用户中途取消                  | runId, reason                        |

所有事件统一带 `runId + sequence + createdAt`。emit 路由:

```text
LangGraph node 内部 emit AgentRunEvent
    ↓
createSequencedEventEmitter(emit, runId)  // 补 sequence/createdAt
    ↓
Controller 的 activeEmitters.get(runId)(toDesktopGraphEvent(...))
    ↓
event.sender.send(videoAgent:event, desktopEvent)  // per-invoke 闭包
    ↓
miaomaAPI.videoAgent.onEvent 回调
```

**channel 设计选择**(待你定):

- **方案 A(单一 event channel)**:单一 `videoAgent:event` channel + 13 种事件 discriminated union。语义清晰,renderer 端 switch 一遍。
- **方案 B(commit 4 已选)**: `VIDEO_AGENT_STATUS` / `VIDEO_AGENT_LOG` 两个 channel 分立。语义直白但 channel 多。

**采用方案 A**:本阶段 commit 5 改 `shared/ipc.ts` + renderer reducer,跟 LangGraph 事件模式对齐,降低心智负担。

---

## 5. Electron IPC 接线(`apps/desktop/client/video-agent-ipc.ts`)

### 5.1 当前缺口(commit 4 状态)

| 维度                         | commit 4 状态       | Phase 3 目标                                         |
| ---------------------------- | ------------------- | ---------------------------------------------------- |
| preload 暴露 videoAgent 方法 | 0 个(只在类型声明)  | 5 个 invoke + 1 个 onEvent                           |
| main.ts handle video-agent   | 0 个                | 5 个 + per-invoke emit 闭包                          |
| runId 状态表                 | 无                  | `Map<runId, { input, sequence, status }>`            |
| emit 路由器                  | 无                  | `activeEmitters: Map<runId, VideoAgentEventEmitter>` |
| ApprovalPayload 类型         | 无(只 phase 字符串) | `SceneApprovalRequest` 全字段                        |
| LangGraph runner             | 无                  | `createVideoCreationGraph({...})` 包装               |

### 5.2 主进程 controller 形态(伪代码)

```text
class VideoAgentController {
  runs = new Map<runId, RunState>()           // 每个 runId 一份状态
  emitters = new Map<runId, Emitter>()         // per-runId emit 回调

  async start(input, emit) {
    const runId = input.runId
    this.runs.set(runId, { input, sequence: 0 })
    this.emitters.set(runId, emit)
    emit(toDesktop({ type: 'run.started', runId }))

    const result = await graph.invoke(state, {
      configurable: { thread_id: runId }
    })

    if (result.__interrupt__) {
      emit(toDesktop({ type: 'approval.required', runId, request: {...} }))
      return { status: 'waiting_for_approval' }
    }
    return { status: 'completed', project: result.project }
  }

  async approve({ runId, approved }, emit) {
    const result = await graph.invoke(
      new Command({ resume: { approved } }),
      { configurable: { thread_id: runId } }
    )
    // 后续 node 跑完的事件继续通过 emit 推
    return { status: 'completed' }
  }
}
```

### 5.3 per-invoke emit 闭包(关键)

```text
ipcMain.handle(IPC.VIDEO_AGENT_START, (event, input) =>
  controller.start(input, (agentEvent) => {
    event.sender.send(IPC.VIDEO_AGENT_EVENT, agentEvent)  // ← per-sender 隔离
  })
)
```

每个 invoke 拿到自己 `IpcMainInvokeEvent.sender`,闭包内 emit 只推给"叫起这个 invoke 的 renderer 进程"。多窗口/重连不串号。

### 5.4 approve 走 fire-and-forget + stream

`approve()` 不返回最终结果,renderer 调完立刻 ack,**后续 node.started/completed** 通过 `videoAgent:event` 持续推送。避免 renderer 的 invoke 一直被挂着等 LangGraph 跑完 5 个节点。

---

## 6. 视频项目持久化(`apps/desktop/client/video-project-store.ts`)

存储位置:**Electron `app.getPath('userData')/video-projects/<safeProjectId>.json`**(同 Electron 桌面应用惯例,跨平台一致:macOS 是 `~/Library/Application Support/<appName>/`,Windows 是 `%APPDATA%/<appName>/`,Linux 是 `~/.config/<appName>/`)。

文件后缀 `.json`(通用,不带品牌前缀)。同级目录布局:

```
userData/
├── video-projects/        ← saveProject 落盘到这里
│   └── <safeProjectId>.json
├── agent-runs/            ← Phase 5 SqliteSaver 升级后用,本阶段空目录
├── custom-voices/         ← Phase 5 接 IndexTts2 自定义音色用
└── ...
```

职责:

1. `saveProject({ project })` → 调 `VideoProjectSchema.parse` 二次校验 → `mkdir -p` → 写 `<safeProjectId>.json` → 返回 `{ path, project } | { success: false, error }`
2. `readProject({ projectId })` → 同名文件读 JSON → `parse` → 返回
3. `listProjects()` → 扫 `userData/video-projects/*.json` → 列表
4. `deleteProject({ projectId })` → unlink

**本仓 commit 5+ 内的实现**:用 Node fs + zod,不做加密、不做版本迁移(留到 Phase 5)。临时目录用 `app.getPath('temp')`,导出产物用 `app.getPath('downloads')`。

---

## 7. 模块划分(本阶段新增 / 修改)

### 7.1 新增(`packages/video-agent/`)

```
src/
├── graph/
│   ├── state.ts                          ← Annotation.Root + ApprovalRequest/Resume
│   ├── checkpoint.ts                     ← MemorySaver 工厂
│   ├── nodes.ts                          ← 10 个 node + createInstrumentedNode
│   └── graph.ts                          ← StateGraph 装配 + start/resume runner
├── events/
│   ├── agent-run-event.ts                ← discriminated union 13 事件
│   └── event-emitter.ts                  ← createSequencedEventEmitter + serializeError
├── prompts/
│   ├── creative-brief.ts                 ← 新:LLM prompt + Zod schema
│   ├── scene-planner.ts                  ← 新:LLM prompt + Zod schema
│   └── asset-matcher.ts                  ← 新:LLM prompt + Zod schema
├── tools/
│   └── video-agent-tools.ts              ← 扩:9 个方法接口 + 默认 fs 实现
└── index.ts                              ← barrel 加 graph/events/tools
```

### 7.2 修改

- `packages/video-project/src/schema.ts` —— **大扩**:从 commit 2 的 7 个 schema 扩展到完整 17 个。需要新增:`VideoClip / VoiceClip / SubtitleClip / MusicClip / TimelineClip(discriminatedUnion) / TimelineTrack / TimelineTrackKind / ProjectAssets / Scene(扩字段) / CanvasConfig / ProjectMetadata / AgentConversationBlock(5 种渲染块 union) / AgentConversationMessage / AiRunMetadata`,顶层 `VideoProjectSchema` 加 `schemaVersion` + `superRefine` 校验 track.clips.assetId 引用闭合 & endMs > startMs。
- `packages/video-agent/src/index.ts` —— barrel 暴露 graph/events/tools
- `packages/video-agent/src/providers/model-provider.ts` —— 加 `generateText(input)` 方法(LLM 纯文本生成,给 brief / planScenes / matchAssets 用)
- `packages/video-agent/src/providers/m3-chat-model-provider.ts` —— 实现 `generateText`
- `packages/video-agent/src/graph/steps/analyze-assets.ts` —— **保留**作为工具函数,新写 `graph/nodes.ts` 里 `analyzeAssets` node 适配层调用它

### 7.3 新增(`apps/desktop/`)

```
client/
├── video-agent-ipc.ts                    ← controller + registerVideoAgentIpc
├── video-project-store.ts                ← 持久化
└── main.ts                               ← 改:app.whenReady 内注册 videoAgentIpc

shared/
├── video-agent-event.ts                  ← 13 事件 Desktop 类型(本仓 renderer 用)
└── ipc.ts                                ← 改:把 VIDEO_AGENT_STATUS/LOG 合并成 VIDEO_AGENT_EVENT
```

### 7.4 修改

- `apps/desktop/client/main.ts` —— `whenReady` 内串行 `registerVideoProjectIpc()` + `registerVideoAgentIpc()`
- `apps/desktop/client/preload.ts` —— 5 个 videoAgent invoke + 1 个 onEvent 全 wire 到 `ipcRenderer.invoke / .on`

---

## 8. 数据契约(关键 schema 字段)

仅列本阶段相比 commit 2 的**新增/扩展**字段:

```ts
// 顶层
VideoProjectSchema = {
  schemaVersion: '1.0.0',
  metadata: { projectId, title, createdAt, updatedAt },
  canvas: { width, height, fps, durationMs, safeArea },
  tracks: TimelineTrack[],
  assets: ProjectAssets,
  agentConversation: AgentConversationMessage[],   // 审批/对话历史
  renderConfig: RenderConfigSchema
}

// 校验
.superRefine((project, ctx) => {
  // 1. track.clips.assetId 必须都在 assets.videos/voices/music 里
  // 2. 每个 clip.endMs > startMs
  // 3. canvas.durationMs ≈ sum(clip durations)
})

// 分镜(commit 2 没建,本阶段新增)
SceneSchema = {
  sceneId, order, startMs, endMs,
  narration,                  // TTS 要念的旁白
  visualBrief,                // LLM 写的画面描述,match_assets 用
  matchedAssetId,             // match 节点写入
  qualityScore,               // 可选:低分重跑用(plan §3 决策点 1)
  subtitleLines               // TTS 朗读分段,scene-planner prompt 强约束
}

// Agent 对话历史(本阶段新增)
AgentConversationMessageSchema = {
  role: 'assistant' | 'user',
  blocks: AgentConversationBlockSchema[],   // text | scenes | approval_request | ...
  createdAtMs
}

// 13 事件 union(本阶段新增)
AgentRunEventSchema = z.discriminatedUnion('type', [
  RunStarted, NodeStarted, NodeCompleted, NodeFailed,
  ModelStreamStarted, ModelStreamDelta, ModelStreamCompleted, ModelDelta,
  VoiceRegenerationProgress,
  ApprovalRequired,
  RunCompleted, RunFailed, RunCancelled
])
```

---

## 9. 流水线总览(对照你画的图)

```
START
  │
  ▼
scan_assets                — readdir + ext filter → AssetAnalysis[] 骨架
  │
  ▼
analyze_assets             — probeMedia + extractKeyframes + describeFrames
  │                          (commit 4 已有,本阶段加 node 适配层)
  ▼
creative_brief             — M3 产出 CreativeBrief
  │
  ▼
plan_scenes                — M3 产出 PlannedScene[]
  │
  ▼
scene_approval ★           — interrupt() 抛 SceneApprovalRequest
  │                          ↑ renderer 收到 approval.required 事件
  │                          ↑ UI 弹分镜确认窗,调 approve({runId, approved})
  │                          ↓ approve=true → return {} → 进入 match_assets
  │                          ↓ approve=false → 抛错 → run.failed
  ▼
match_assets               — M3 给每个 scene 选 AssetMatchResult
  │
  ▼
synthesize_voice           — VolcengineTtsProvider 跑每个 scene 旁白
  │
  ▼
assemble_timeline          — 拼 VideoProject(纯函数,无 IO)
  │
  ▼
validate_project           — VideoProjectSchema.parse 二次校验
  │
  ▼
save_project               — 调 desktop video-project-store.saveProject
  │
  ▼
END
```

---

## 10. 实施顺序(commit 粒度,4 个 commit)

> **commit 5-8 是本阶段主体**;commit 9 起是 Phase 4(多档分辨率)。

### Commit 5:主进程 video-agent IPC + demo controller

**目的**:在不依赖 LangGraph 的前提下,渲染层能看到完整事件流 + 假分镜确认弹窗。先把 IPC 链路打通。

新增:

- `apps/desktop/client/video-agent-ipc.ts`(demo controller,模拟 10 节点进度 + 假 approval)
- `apps/desktop/client/video-agent-controller-factory.ts`(env 切换 demo / langgraph)
- `apps/desktop/shared/video-agent-event.ts`(13 事件 Desktop 类型)
- `apps/desktop/shared/voice-defaults.ts`(`voiceOutputDirectory = path.join(os.tmpdir(), 'miaojian-video-agent', 'voices')`)
- `apps/desktop/client/video-project-store.ts`(持久化)

修改:

- `apps/desktop/client/main.ts`(`whenReady` 内 `registerVideoAgentIpc` + `registerVideoProjectIpc`)
- `apps/desktop/client/preload.ts`(5 个 videoAgent invoke + 1 个 onEvent 全 wire)
- `apps/desktop/shared/ipc.ts`(`VIDEO_AGENT_STATUS / LOG` 合并成 `VIDEO_AGENT_EVENT`,加 `ApprovalPayload` 类型)

测试:

- 5 个 controller 单元测试(start / approve / cancel / regenerateScene / regenerateVoices 状态机)
- 1 个 store 单元测试(save → read → list → delete 往返)
- 6 tests pass

可演示:`pnpm dev` → 选素材目录 → 点开始 → 看到 14 个 phase 进度 + 假分镜弹窗 → 批准 → run.completed。

### Commit 6:LangGraph state + nodes + graph + 真接 controller

**目的**:把 `@langchain/langgraph` 真接进 controller,删除 demo fallback 路径。

新增(`packages/video-agent/src/`):

- `graph/state.ts`
- `graph/checkpoint.ts`(`MemorySaver`)
- `graph/nodes.ts`(10 node + createInstrumentedNode)
- `graph/graph.ts`(StateGraph 装配 + start/resume runner)
- `events/agent-run-event.ts`(13 事件 Zod union)
- `events/event-emitter.ts`(createSequencedEventEmitter + serializeError + redactSecrets)
- `prompts/creative-brief.ts`
- `prompts/scene-planner.ts`
- `prompts/asset-matcher.ts`

修改:

- `packages/video-agent/src/tools/video-agent-tools.ts`(扩到 9 个方法)
- `packages/video-agent/src/providers/model-provider.ts`(加 `generateText`)
- `packages/video-agent/src/providers/m3-chat-model-provider.ts`(实现 `generateText`)
- `packages/video-agent/src/graph/steps/analyze-assets.ts`(保持纯函数,node 适配层另写)
- `packages/video-agent/src/index.ts`(barrel 暴露 graph/events/tools)

测试:

- `events/event-emitter.test.ts`(createSequencedEventEmitter 序号递增 + redactSecrets 把 `ark-...` 替换为 `[REDACTED]`)
- `graph/nodes.test.ts`(每个 node 用 stub LLM/TTS,断言输入输出 state 字段)
- `graph/graph.test.ts`(端到端 start → interrupt → approve → 跑完,断言 13 事件序列)
- ~15 tests pass

可演示:填 .env(ARK_API_KEY + VOLCENGINE_TTS_APP_ID)→ 真走完 10 节点 → 真分镜 confirm 弹窗。

**前端数据契约(commit 6 落地)**:

commit 6 末尾交付一份 `apps/desktop/shared/video-agent-event-contract.md`,renderer 端按此契约消费事件流。包含:

| 契约项                       | 内容                                                                                            |
| ---------------------------- | ----------------------------------------------------------------------------------------------- |
| **Event 字段表**             | 13 种 AgentRunEvent → renderer `useVideoAgent` reducer switch 用                                |
| **ApprovalRequired payload** | `{ type: 'scene-plan', payload: { brief: CreativeBrief, scenes: PlannedScene[] } }` —— 弹窗消费 |
| **NodeProgress 渲染字段**    | `{ nodeKey, phase: 'started' \| 'completed' \| 'failed', durationMs }`                          |
| **Approval 请求结构**        | `miaomaAPI.videoAgent.approve({ runId, approved: boolean })`                                    |
| **Cancel 请求结构**          | `miaomaAPI.videoAgent.cancel({ runId })`                                                        |
| **Voice regen 进度**         | `voice.regeneration.progress: { current, total, percent }`                                      |
| **Model stream delta**       | SSE 风格的逐 token 上报,UI 渲染 spinner                                                         |
| **Schema 导入路径**          | `import type { Scene, CreativeBrief } from '@miaoma-magicut/video-project'`                     |

这份契约是 renderer 的"TypeScript 类型 import 单一来源",**不允许**前端自创 schema。

### Commit 7:packages/video-project schema 大扩

**目的**:把 commit 2 的 7 个简化 schema 扩到完整 17 个,对接 LangGraph 真实 project 形态。

修改:

- `packages/video-project/src/schema.ts`:
    - 新增:`VideoClip / VoiceClip / SubtitleClip / MusicClip / TimelineClipSchema(discriminatedUnion) / TimelineTrack / TimelineTrackKind / ProjectAssets / Scene(扩字段:order / narration / visualBrief / subtitleLines / matchedAssetId / qualityScore) / CanvasConfig / ProjectMetadata / AgentConversationBlock(5 种渲染块 union) / AgentConversationMessage / AiRunMetadata`
    - 顶层 `VideoProjectSchema`:加 `schemaVersion = '1.0.0'` + `superRefine` 校验 track.clips.assetId 引用闭合 & endMs > startMs

测试:

- 现有 schema.test.ts 扩到 ~15 个断言
- 新增 superRefine 校验的负例测试(故意给 assetId 不存在的 clip,期望抛错)

可演示:用 fixtures 写一个完整的 sampleVideoProject,parse 成功;人为破坏一个引用,parse 抛错。

### Commit 8:renderer 端 scene_approval UI + 全链路验证

**目的**:让分镜确认弹窗能渲染真实 scenes + 调 approve/cancel,完成从选视频目录到 project 落盘的端到端冒烟。

新增:

- `apps/desktop/renderer/components/SceneApprovalDialog.tsx`(消费 approval.payload.scenes 渲染卡片)
- `apps/desktop/renderer/hooks/useVideoAgent.ts`(`useEffect` 订阅 onEvent 按 type dispatch 到 reducer)
- `apps/desktop/renderer/assets/song/song.json`(10 条手工元数据)
- `apps/desktop/renderer/assets/song/<10>.m4a`(手工准备,**不入仓**也无所谓,纯渲染用)

修改:

- `apps/desktop/renderer/pages/create-screen.tsx`(接 videoAgent 流 + 弹 approval dialog)

测试:

- `useVideoAgent.test.tsx`(用 Testing Library + jsdom,模拟 emit 序列,断言 reducer 状态)
- `SceneApprovalDialog.test.tsx`(渲染 mock scenes + 点 approve 调 miaomaAPI.approve)

可演示:点开始 → 真分镜流式吐到 UI → 弹窗 → 选一首 BGM → 批准 → 项目落盘到 `userData/projects/*.json`。

---

## 11. 验收

### 11.1 自动化测试

commit 5-8 累计 vitest:**~50 tests pass**:

- 6 (commit 5 controller + store)
- 15 (commit 6 nodes + graph + event emitter)
- 15 (commit 7 schema)
- ~14 (commit 8 hook + dialog)

### 11.2 端到端冒烟

1. `pnpm install` 0 error
2. `pnpm -r test:run` 全绿
3. `pnpm start` 启动 Electron,DevTools 自动打开
4. 准备 `apps/desktop/renderer/assets/song/*.m4a` 至少 1 段 + 测试视频素材目录(3-5 个 mp4)
5. 在 `/create` 页点击"开始剪辑",DevTools Network 看到 `video-agent:start` IPC,主进程终端看到 10 节点的 `node.started / completed` 日志流
6. scene_approval 阶段 DevTools 看到 `video-agent:event` 推 `approval.required`,UI 弹分镜确认窗
7. 点"批准"→ 看到 `match_assets / synthesize_voice / assemble_timeline / validate_project / save_project` 依次 `node.completed`
8. `run.completed` 后 `userData/video-projects/*.json` 存在,内容包含完整 timeline
9. 取消按钮(中途点停止)→ `run.cancelled` 事件,5s 内 LangGraph state thread 被清除

### 11.3 不破坏既有

- `pnpm probe:tts` 仍能写出 25965 字节 mp3
- `pnpm probe:m3` 仍能识别 `宝马x5.png`
- `pnpm probe:media` 仍能跑 6 步
- `pnpm lint` 0 error
- `pnpm -F desktop test:run` 仍 1/1 pass

---

## 12. 文件清单(commit 5-8 期间新增/修改)

```
apps/desktop/
├── client/
│   ├── main.ts                                    ← 改:registerVideoAgentIpc
│   ├── preload.ts                                 ← 改:5 invoke + 1 onEvent wire
│   ├── video-agent-ipc.ts                         ← 新:controller + register
│   ├── video-agent-controller-factory.ts          ← 新
│   └── video-project-store.ts                     ← 新
└── shared/
    ├── ipc.ts                                     ← 改:VIDEO_AGENT_EVENT 合并
    └── video-agent-event.ts                       ← 新:13 事件 Desktop 类型

packages/video-agent/src/
├── index.ts                                       ← 改:barrel
├── graph/
│   ├── state.ts                                   ← 新
│   ├── checkpoint.ts                              ← 新
│   ├── nodes.ts                                   ← 新
│   ├── graph.ts                                   ← 新
│   └── steps/analyze-assets.ts                    ← 不动(node 适配另写)
├── events/
│   ├── agent-run-event.ts                         ← 新
│   └── event-emitter.ts                           ← 新
├── prompts/
│   ├── creative-brief.ts                          ← 新
│   ├── scene-planner.ts                           ← 新
│   └── asset-matcher.ts                           ← 新
├── tools/video-agent-tools.ts                     ← 改:扩 9 方法
└── providers/
    ├── model-provider.ts                          ← 改:+ generateText
    └── m3-chat-model-provider.ts                  ← 改:实现 generateText

packages/video-project/src/schema.ts               ← 改:扩到 17 schema

apps/desktop/renderer/
├── components/SceneApprovalDialog.tsx             ← 新
├── hooks/useVideoAgent.ts                         ← 新
└── pages/create-screen.tsx                        ← 改:接 videoAgent 流
```

---

## 13. 风险与开放问题

1. **驳回路径选择**:走"抛错 + 外层重 start"。**已确认**(用户拍板)
2. **Checkpoint 持久化**:用 `MemorySaver`,重启进程 run state 丢失。**已确认**(用户拍板)
3. **LLM streaming 上报**:commit 6 默认只在 `node.completed` 时一次性上报 LLM 结果。**待 Phase 5 评估**(简化实现)
4. **channel 设计选择**:commit 4 拆 `status/log` 分立,本阶段改回单 `VIDEO_AGENT_EVENT` + 13 事件 union。**已确认**(用户拍板)
5. **FFmpeg 二进制路径**:commit 6 起 `scan_assets` / `analyze_assets` 需要 ffmpeg/ffprobe 路径。开发期用 `pnpm exec ffmpeg`(系统 PATH),打包后用 `process.resourcesPath/bin/<platform>/`。**待 Phase 4 末尾**统一做 `resolveVideoExportBinaries`,本阶段 commit 6 临时用 env 变量 + PATH fallback。
6. **quality_scoring agent 嵌哪里 + 怎么打分**:**方案 2(conditional edge + revise node)** 已确认,具体评分公式见 §15
7. **BGM 来源**:手工 10 段 m4a + song.json 形态,**不写 generate-demo-bgm.ts**
8. **`generate-voice-previews.ts`**:TTS 音色预览脚本,跟 BGM 无关,本阶段不在范围
9. **`menu:command` 主进程 sender 未接**:Phase 5 评估
10. **apps/server Next.js 上传路由**:commit 8 末尾评估是否做最小 upload route

---

## 14. Phase 4 锚点(本阶段不做,留给后续)

- `feat(export): 4-tier resolution ladder (720p/1080p/2k/4k)` — schema 扩 quality 枚举 + ffmpeg scale 注入 + UI 控件
- `feat(renderer): show M3 description on asset cards` — Editor 卡片显示 `description`
- `chore(agent): upgrade LangGraph checkpoint to SqliteSaver` — 跨进程 run 恢复
- `chore(agent): evaluate LLM streaming in node events` — `emitModelStreamReport` 接入
- `feat(server): upload route + per-user project list` — Next.js Route Handler + userData/projects
- `feat(electron): menu bar + window:* 完整实现` — 补 main.ts Menu.setApplicationMenu
- `feat(dist): code signing + notarization` — macOS Developer ID + Windows 代码签名
- `feat(catalog): expand bundled BGM library` — 替换手工 m4a,接入正版 BGM 库

---

## 15. quality_scoring 多维度评分公式(方案 2 实现细节)

### 15.1 引用清单(可追溯)

**视频/分镜质量主框架**:

- **VBench**(Huang et al., 2023, NJU + ByteDance):[arxiv:2311.17922](https://arxiv.org/abs/2311.17922) — 16 维度视频质量,CapCut/Doubao 内部引用
- **TC-Bench**(Ren et al., 2024, Princeton+Apple):[arxiv:2406.08656](https://arxiv.org/abs/2406.08656) — 时间组合性 + 镜头间一致性,最贴近"分镜级"评估
- **EvalCrafter**(Liu et al., 2023, NUS):[arxiv:2310.12242](https://arxiv.org/abs/2310.12242) — 文本-视频对齐综合分

**Agent 规划一致性**:

- **ReAct**(Yao et al., 2022):[arxiv:2210.03629](https://arxiv.org/abs/2210.03629) — plan-faithfulness
- **AgentBench**(Liu et al., 2023):[arxiv:2308.03688](https://arxiv.org/abs/2308.03688) — 规则遵循 + 步效

**业界 rubric**:

- **CapCut Quality Score**(官方 2024):[capcut.com/...](https://www.capcut.com/resource/how-capcut-uses-quality-score-to-rank-templates) — 0-100,60+ 进推荐流,80+ trending
- **OmniShow / HOIVG-Bench**(ByteDance, ICML 2026):[github.com/Correr-Zhou/OmniShow](https://github.com/Correr-Zhou/OmniShow) — 多模态条件生成评估

### 15.2 五维度评分公式

参考 VBench 16 维度 + TC-Bench 镜头间一致性 + ReAct plan-faithfulness + CapCut 0-100 阈值,本仓 5 个维度(总分 0-1,阈值 **0.65**):

| 维度                                          | 含义                                                          | 满分 | 阈值      | 引用                                          |
| --------------------------------------------- | ------------------------------------------------------------- | ---- | --------- | --------------------------------------------- |
| **D1 脚本一致性**(`script_fidelity`)          | brief → scene.narration 关键点覆盖率 + 语义相似度             | 1.0  | ≥0.70     | VBench compositional fidelity + ACL LLM-judge |
| **D2 TTS 可朗读性**(`tts_readability`)        | 平均句长 ≤25 CN 字 + 标点密度 4-7/100 字 + 无连续 30 字无标点 | 1.0  | ≥0.85     | StepAudio 2.5 + MiniMax QA rubric             |
| **D3 画面指令清晰度**(`visual_brief_clarity`) | visualBrief 可执行性(具体到动作/镜头/物体)                    | 1.0  | ≥0.70     | TC-Bench compositional fidelity               |
| **D4 节奏合理性**(`pacing`)                   | cut 频率落在短频 0.6-1.2/s + 静音切点均匀                     | 1.0  | ≥0.60     | VBench pacing + Adobe Sensei beat-align       |
| **D5 镜头间一致性**(`shot_coherence`)         | 相邻 scene 视觉 CLIP 余弦 ∈ [0.25, 0.65](低=不连贯,高=单调)   | 1.0  | 命中 band | TC-Bench temporal consistency                 |

**总分加权**:

```
quality_score = 0.25·D1 + 0.20·D2 + 0.20·D3 + 0.15·D4 + 0.20·D5
```

**依据**:0.65 取自 CapCut quality score 60+ 阈值归一化(60/100 = 0.6,**0.65 略保守**,因为是 planning-stage 评估而非成品评估,留 buffer)。

### 15.3 节点拓扑(方案 2:conditional edge + revise node)

```
plan_scenes
    │
    ▼
scene_quality(node)            — 调 LLM 跑 5 维度评分,产出 sceneQualityScore + lowestReason
    │
    ├─[score ≥ 0.65 或 reviseCount ≥ 3]─→ match_assets
    │   (score < 0.65 时 emit warning,降级通过)
    │
    └─[score < 0.65 且 reviseCount < 3]─→ revise_scenes(node)
                                            │
                                            └─→ scene_quality(reviseCount += 1)
```

**State 新增字段**:

```ts
sceneQualityScore: number | undefined; // 当前轮 quality_score
reviseCount: number; // 已重试次数
```

**LangGraph 实现**:

```text
.addConditionalEdges('scene_quality', (state) => {
  if ((state.sceneQualityScore ?? 0) >= 0.65 || state.reviseCount >= 3) return 'accept'
  return 'revise'
}, { accept: 'match_assets', revise: 'revise_scenes' })
.addEdge('revise_scenes', 'scene_quality')
```

### 15.4 降级启发式(LLM 不可用时)

| 维度 | 降级公式                                                                            |
| ---- | ----------------------------------------------------------------------------------- |
| D1   | `narration.length / brief.length` 在 [0.4, 0.9] → 1.0,否则 0.4                      |
| D2   | `subtitleLines.length >= scenes.length && avg(sentenceLength) <= 25` → 1.0,否则 0.5 |
| D3   | `visualBrief.length >= 30` → 0.8,否则 0.4                                           |
| D4   | `std(scene.endMs - scene.startMs) < avg/2` → 1.0,否则 0.5                           |
| D5   | **skip**(LLM only,降级时 D5 = 0.5)                                                  |

降级总阈值改为 **0.50**(比 LLM 在线低 0.15,启发式天然弱)。

### 15.5 Prompt 形态(`prompts/quality-scoring.ts`)

中文 system prompt:

```
你是短视频分镜质量评审员。对每个分镜,从 5 个维度打分(0-1):
1. 脚本一致性:这条分镜的旁白是否覆盖了 brief 的关键信息?
2. TTS 可朗读性:字幕分段是否过长/缺标点?
3. 画面指令清晰度:visualBrief 能否直接交给素材匹配阶段执行?
4. 节奏合理性:这条分镜的时长是否与前后分镜协调?
5. 镜头间一致性:这条分镜与相邻分镜的视觉是否单调或跳跃?

输出严格 JSON,格式:
{ scenes: [{ sceneId, dimensions: {D1, D2, D3, D4, D5}, lowestReason }] }
```

### 15.6 Test 矩阵

| 测试                                              | 覆盖                                                                                              |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `quality-scoring.test.ts:high-quality-scene`      | 高分通过,score ≥ 0.65,不放行 revise                                                               |
| `quality-scoring.test.ts:low-quality-scene`       | 低分触发 revise,LLM 给出 lowestReason                                                             |
| `quality-scoring.test.ts:degrade-llm-unavailable` | LLM 不可用 → 启发式降级,score >= 0.50 即可通过                                                    |
| `quality-scoring.test.ts:max-revise-cap`          | reviseCount = 3 后即使低分也放行,emit warning                                                     |
| `graph.test.ts:scene-quality-loop`                | end-to-end:plan → quality(reviseCount=0 低分)→ revise → quality(reviseCount=1 高分)→ match_assets |

---

## 16. 前置条件清单(commit 5 开工前必须就位)

按"硬阻塞"vs"软依赖"分类。**硬阻塞**不满足时 commit 5 无法启动,**软依赖**不满足时 commit 5 仍能推进但演示效果打折。

### 16.1 硬阻塞(commit 5 开工前必须完成)

| #   | 项目                                                                                                                                                 | 当前状态                               | 谁做           | 怎么验证                                                                                 |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- | -------------- | ---------------------------------------------------------------------------------------- |
| H1  | `pnpm install` + `pnpm -r test:run` 全绿                                                                                                             | ✅ commit 1-4 验证                     | —              | `pnpm install` 0 error,4 个包 vitest 全过                                                |
| H2  | `pnpm lint` 0 error(各包 + apps/desktop)                                                                                                             | ⚠️ apps/server next.config.ts 已知问题 | 无人(独立问题) | `pnpm -F desktop -F video-agent -F video-project run lint` 全过                          |
| H3  | `apps/desktop/scripts/api-probe/probe:{m3,media,tts}` 都能跑通                                                                                       | ✅ 验证过                              | —              | `pnpm probe:all` 三个都写文件不抛错                                                      |
| H4  | `apps/desktop/shared/ipc.ts` 把 commit 4 的 `VIDEO_AGENT_STATUS / LOG` 合并为单 `VIDEO_AGENT_EVENT` channel + 13 事件 union 类型(channel 设计选择 A) | ❌ 还没改                              | commit 5 头部  | 改完 `pnpm -F desktop typecheck` 过                                                      |
| H5  | `preload.ts` 把 5 个 videoAgent invoke + 1 个 onEvent 全 wire 到 `ipcRenderer.invoke / .on`                                                          | ❌ 还没接                              | commit 5       | 改完 DevTools 调 `miaomaAPI.startVideoAgent(...)` 至少不打 "undefined is not a function" |

### 16.2 软依赖(commit 5 推进时按需补)

| #   | 项目                                                          | 影响                             | 补救方案                                                                          |
| --- | ------------------------------------------------------------- | -------------------------------- | --------------------------------------------------------------------------------- |
| S1  | `.env.local` 配 `ARK_API_KEY`(M3 多模态)                      | commit 6 真接 LLM 才需要         | commit 5 demo controller 不打 LLM,无影响                                          |
| S2  | `.env.local` 配 `VOLCENGINE_TTS_APP_ID`(火山 TTS)             | commit 6 synthesize_voice 才需要 | commit 5 demo controller 不调 TTS,无影响                                          |
| S3  | `apps/desktop/bin/{darwin,win32}/ffmpeg(.exe)` 二进制         | commit 6 真跑 ffmpeg 才需要      | commit 5 demo controller 不调 ffmpeg,commit 6 临时用系统 PATH(`pnpm exec ffmpeg`) |
| S4  | renderer `/create` 页面接 `miaomaAPI.startVideoAgent(...)`    | commit 8 才做                    | commit 5 demo controller 仍能在 `app.whenReady` 内自动跑一次验证事件流            |
| S5  | `apps/server/app/api/upload/route.ts`(Next.js multipart 上传) | Phase 4 才做                     | commit 5 不影响                                                                   |
| S6  | 真实 BGM 素材(10 段 m4a)                                      | commit 8 renderer 才需要         | commit 5 demo controller 用假数据                                                 |

### 16.3 commit 5 推进顺序(细化)

按 H4 → H5 → demo controller → smoke test 的顺序,**每步独立可验证**:

**阶段 A(单 commit,可独立发)**:H4 + H5

- 改 `shared/ipc.ts`:删 `VIDEO_AGENT_STATUS / VIDEO_AGENT_LOG`,加 `VIDEO_AGENT_EVENT` + `VideoAgentEvent` union(13 种类型 discriminated union)
- 改 `client/preload.ts`:5 个 invoke + 1 个 onEvent 全部 wire
- 改 `client/main.ts`:`app.whenReady` 内注册 5 个 `ipcMain.handle(IPC.VIDEO_AGENT_*, ...)`(handler 暂时是 stub:`throw new Error('not implemented')`)
- **可验证**:DevTools 调 `miaomaAPI.startVideoAgent({...})` 收到 stub 抛错,而不是 "undefined is not a function"

**阶段 B(单 commit)**:demo controller 实现

- 新建 `client/video-agent-ipc.ts`:`createDemoVideoAgentController` 类,内部 `runs: Map<runId, ...>` + `emitters: Map<runId, ...>`,模拟 10 节点 setTimeout 推进 + emit `node.started/completed/run.completed`
- 新建 `client/video-agent-controller-factory.ts`:按 env 切换 demo / langgraph(本阶段只 demo)
- 改 `client/main.ts`:用 factory 替换阶段 A 的 stub handler
- **可验证**:DevTools 调 `miaomaAPI.startVideoAgent(...)` 后,`miaomaAPI.onVideoAgentEvent(...)` 收到 14 条 `node.started/completed` 事件流 + `run.completed`

**阶段 C(单 commit)**:scene_approval 假弹窗事件

- 在 demo controller 里,scan_assets 完成后 emit `approval.required` 事件(payload = mock scenes)
- DevTools `onVideoAgentEvent` 收到 `approval.required`,调 `approve({runId, approved: true})`,demo controller 继续推进到 run.completed
- **可验证**:DevTools 看到 `approval.required` 事件,approve 后看到 `match_assets/synthesize_voice/...` 后续节点 start/completed

**阶段 D(单 commit)**:video-project-store + 端到端 saveProject

- 新建 `client/video-project-store.ts`(`userData/video-projects/<id>.json` 读写)
- demo controller 在 assemble_timeline 节点调 `store.saveProject({project})`,emit `run.completed` payload 带 `savedProjectPath`
- **可验证**:`run.completed` 事件 payload 含 `savedProjectPath`,`fs.exists(path)` 确认文件存在,内容 JSON.parse 后是合法 VideoProject

阶段 A ~ D 累计 ~6 文件,~10 tests,1 个端到端 demo 流。这就是 commit 5 实际做的事。

---

## 17. 完整 commit 划分(2.0 实施顺序,基于前置条件展开)

下面是 plan §10 的细化版,**前置 + 主体 commit 分两批**推。每一批单独可验证、可回滚。

### 17.1 批 1:前置(commit 0a / 0b / 0c,独立小 commit)

| commit                                                                            | 内容                                                 | 文件 | 验证                                |
| --------------------------------------------------------------------------------- | ---------------------------------------------------- | ---- | ----------------------------------- |
| **0a** `chore(ipc): consolidate VIDEO_AGENT_STATUS/LOG into single EVENT channel` | `shared/ipc.ts` 改 channel + `VideoAgentEvent` union | 1 改 | typecheck 过                        |
| **0b** `chore(preload): wire 5 videoAgent invoke + onEvent to ipcRenderer`        | `client/preload.ts` 改                               | 1 改 | DevTools 调 invoke 不抛 "undefined" |
| **0c** `chore(main): register stub VIDEO_AGENT_* ipcMain handlers`                | `client/main.ts` 改,handler 抛 "not implemented"     | 1 改 | 5 个 invoke 都返回 500 而非 crash   |

### 17.2 批 2:主体(commit 5 / 6 / 7 / 8,plan §10 已列)

| commit                                                                       | 内容                          | 前置依赖         |
| ---------------------------------------------------------------------------- | ----------------------------- | ---------------- |
| **5** `feat(agent): demo controller + per-invoke emit + runId state table`   | 阶段 A/B/C/D 合并             | 0a + 0b + 0c     |
| **6** `feat(agent): langgraph 10-node pipeline wired to controller`          | LangGraph 真接,LLM + TTS 真跑 | 5 + S1 + S2 + S3 |
| **7** `feat(project): expand video-project schema to 17 types + superRefine` | Zod schema 大扩               | 独立,可任意顺序  |
| **8** `feat(renderer): scene-approval dialog + useVideoAgent hook`           | 前端契约落地                  | 6 + 7            |

### 17.3 批 3:Phase 4 锚点(本 plan 不展开)

见 §14。
