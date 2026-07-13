# 剪辑智能体工作流设计

> 简历描述:**基于 LangGraph.js 编排"素材扫描 → 创意生成分镜 → 分镜审批 → 素材匹配 → 语音合成"全链路;利用 Checkpoint 持久化机制实现断点续跑,支持用户修改分镜后从中断处继续执行。**

---

## 1. 目标

把"用户上传视频 → AI 理解画面 → 自动生成创意 → 拆分分镜 → 用户审批 → 自动匹配素材 → 配音 → 拼成最终视频"串成一条**可断点续跑**的 LangGraph 工作流。

### 当前链路(commit 4)

- ✅ `probeMedia` + `extractKeyframes` + `describeFrames`(commit 2/3)
- ✅ `analyzeAssets` 串成(commit 4)
- ❌ 创意生成分镜(creative_brief + plan_scenes)未接
- ❌ 分镜审批(scene_approval)未接
- ❌ 素材匹配(match_assets)未接
- ❌ 语音合成(synthesize_voice)未接
- ❌ **断点续跑未实现**(plan §13 已确认本阶段 MemorySaver)

### 本设计目标

新增 6 个节点 + LangGraph 装配 + Checkpoint 接入,实现"完整端到端工作流 + 断点续跑"。

---

## 2. 节点拓扑

`plan-2.0-langgraph.md` §9 已定义 10 节点直线流水线,本设计补充实现细节。

### 2.1 完整 10 节点流水线

```
START
  │
  ▼
[scan_assets]                ← 用增量算法(见 incremental-scan.md)
  │
  ▼
[analyze_assets]             ← probe + extractKeyframes + describeFrames
  │
  ▼
[creative_brief]             ← LLM 解析 brief → CreativeBrief{title, tone, audience, keyMessages}
  │
  ▼
[plan_scenes]                ← LLM 拆 PlannedScene{narration, visualBrief, startMs, endMs}
  │
  ▼
[scene_approval]             ← interrupt,等用户批
  │                              (详见 plan §9 + long-task-event-stream.md)
  │
  ▼ (approved)
[match_assets]               ← LLM 选素材 → 每个 scene 关联 assetId
  │
  ▼
[synthesize_voice]           ← 流式 TTS + 缓存 + 自动对齐(见 streaming-tts.md)
  │
  ▼
[assemble_timeline]          ← 拼 VideoProject + ffmpeg(见 assemble-and-subtitle.md)
  │
  ▼
[validate_project]           ← Zod 二次校验
  │
  ▼
[save_project]               ← 落盘 userData/video-projects/<id>.json
  │
  ▼
END
```

### 2.2 LangGraph 实现

```ts
import {
    StateGraph,
    START,
    END,
    interrupt,
    Command
} from '@langchain/langgraph';
import { MemorySaver } from '@langchain/langgraph';

const graph = new StateGraph(VideoCreationStateAnnotation)
    .addNode('scan_assets', nodes.scanAssets)
    .addNode('analyze_assets', nodes.analyzeAssets)
    .addNode('creative_brief', nodes.creativeBrief)
    .addNode('plan_scenes', nodes.planScenes)
    .addNode('scene_approval', nodes.sceneApproval)
    .addNode('match_assets', nodes.matchAssets)
    .addNode('synthesize_voice', nodes.synthesizeVoice)
    .addNode('assemble_timeline', nodes.assembleTimeline)
    .addNode('validate_project', nodes.validateProject)
    .addNode('save_project', nodes.saveProject)
    .addEdge(START, 'scan_assets')
    .addEdge('scan_assets', 'analyze_assets')
    .addEdge('analyze_assets', 'creative_brief')
    .addEdge('creative_brief', 'plan_scenes')
    .addEdge('plan_scenes', 'scene_approval')
    .addEdge('scene_approval', 'match_assets')
    .addEdge('match_assets', 'synthesize_voice')
    .addEdge('synthesize_voice', 'assemble_timeline')
    .addEdge('assemble_timeline', 'validate_project')
    .addEdge('validate_project', 'save_project')
    .addEdge('save_project', END)
    .compile({ checkpointer: new MemorySaver() });
```

---

## 3. State Schema

### 3.1 完整字段

```ts
import { Annotation } from '@langchain/langgraph';

const VideoCreationStateAnnotation = Annotation.Root({
    // 用户输入
    input: Annotation<VideoCreationInput>(),

    // run 标识
    runId: Annotation<string>(),

    // 节点产物
    assets: Annotation<AssetAnalysis[]>({ default: () => [] }),
    brief: Annotation<CreativeBrief | undefined>(),
    scenes: Annotation<PlannedScene[]>({ default: () => [] }),
    matches: Annotation<AssetMatchResult[]>({ default: () => [] }),
    voices: Annotation<VoiceSynthesisResult[]>({ default: () => [] }),

    // 最终产物
    project: Annotation<VideoProject | undefined>(),
    savedProjectPath: Annotation<string | undefined>(),

    // 运行时状态
    errors: Annotation<string[]>({ default: () => [] }),
    sceneQualityScore: Annotation<number>(), // plan §15 quality_scoring
    reviseCount: Annotation<number>({ default: () => 0 })
});
```

### 3.2 thread_id 用 runId

`configurable.thread_id = runId`,LangGraph 用它索引 checkpoint。runId 在 start 时由 controller 生成 UUID,前端全程持有,便于关联事件流。

---

## 4. Checkpoint 断点续跑

### 4.1 本阶段:MemorySaver(跟 plan §13 一致)

```ts
import { MemorySaver } from '@langchain/langgraph';

const checkpointer = new MemorySaver();
const app = graph.compile({ checkpointer });
```

**特性**:

- 每个 `graph.invoke(state, { configurable: { thread_id: runId } })` 完成后,LangGraph 自动序列化整个 state 到内存
- 进程重启 → checkpoint 丢失 → runId 失效,用户需重新 start
- 单 run 内的中断恢复:**支持**(同进程内 interrupt → Command resume)

### 4.2 断点续跑场景

| 场景                       | 行为                                                  |
| -------------------------- | ----------------------------------------------------- |
| 进程内 approve 恢复        | `Command({ resume })` 直接 resume,跳过 scene_approval |
| 进程内 regenerateScene     | 修改 state.scenes[i] 后再 resume                      |
| 进程崩溃,run 还在 runId 表 | ❌ MemorySaver 丢,run.completed 标记失败              |
| 用户主动 cancel            | emit run.cancelled,清除 checkpoint                    |

### 4.3 Phase 5 升级路径(本阶段不做)

```
MemorySaver(进程内)
   ↓ Phase 5
SqliteSaver(userData/agent-runs/<runId>.sqlite)
   ↓ 跨进程恢复
PostgresSaver(分布式 / 多用户)
```

升级时只需替换 `compile({ checkpointer })` 的入参,节点代码不动。

---

## 5. scene_approval Human-in-the-Loop

### 5.1 interrupt 用法

```ts
async function sceneApproval(
    state: VideoCreationState
): Promise<Partial<VideoCreationState>> {
    const resume = interrupt<SceneApprovalRequest, SceneApprovalResume>({
        type: 'scene-plan',
        payload: {
            brief: state.brief,
            scenes: state.scenes
        }
    });

    if (resume.approved) {
        return {}; // 进入 match_assets
    } else {
        throw new PipelineCancelledError('User rejected scene plan');
    }
}
```

### 5.2 Controller 端 resume

```ts
// start 时
const result = await app.invoke(initialState, {
    configurable: { thread_id: runId }
});

// 收到 __interrupt__ → emit approval.required → 返回 waiting_for_approval
if (result.__interrupt__) {
    emit({
        type: 'approval.required',
        runId,
        request: result.__interrupt__[0].value
    });
    return { status: 'waiting_for_approval' };
}

// 用户批后 → approve 时
const result2 = await app.invoke(new Command({ resume: { approved: true } }), {
    configurable: { thread_id: runId }
});
```

### 5.3 驳回路径选择(plan §13 已定)

走"抛错 + 外层重 start",**不**用 conditional edge + Command({ goto }) 真回环:

- 实现简单,跟 LangGraph 主线一致
- 状态丢失可接受(scene_approval 前面的 state 仍在 checkpoint 里,approve 失败后用户重新 start 时,前面的节点会**重新跑一次**,浪费一点 token 但语义清晰)
- 真实场景下驳回概率低(< 10%),浪费可控

---

## 6. 修改分镜后从中断处继续(简历核心点)

### 6.1 场景

用户跑了完整流水线,在 scene_approval 看了分镜,觉得第 3 个分镜的文案"不好":

- 不点批准,直接修改第 3 个分镜的 narration / visualBrief
- 点"重新生成该分镜"(不重跑整个流程)
- 系统**只重跑 match_assets → synthesize_voice → assemble_timeline**(3 个节点)
- 第 1、2、4、5、6 分镜保持不变

### 6.2 实现机制(增量更新,详见 scene-regeneration.md)

```ts
// apps/desktop/client/video-agent-scene-regeneration.ts
async function regenerateScene({
    projectId,
    sceneId,
    feedback,
    state,
    tools,
    emit
}) {
    // 1. 找到要修改的分镜
    const sceneIndex = state.scenes.findIndex((s) => s.id === sceneId);
    if (sceneIndex === -1) throw new Error('Scene not found');

    emit({
        type: 'node.started',
        nodeName: 'regenerate_scene',
        runId: state.runId
    });

    // 2. 重新调用 LLM 改写该分镜(用 feedback 引导)
    const newScene = await tools.rewriteScene({
        originalScene: state.scenes[sceneIndex],
        feedback,
        context: {
            brief: state.brief,
            otherScenes: state.scenes.filter((_, i) => i !== sceneIndex)
        }
    });

    // 3. 更新 state.scenes(只更新这一个)
    state.scenes[sceneIndex] = newScene;

    // 4. 重新匹配素材(只这一个分镜)
    state.matches[sceneIndex] = await tools.matchAssetsForScene({
        scene: newScene,
        assets: state.assets
    });

    // 5. 重新合成配音(只这一句,可能命中 TTS 缓存)
    state.voices[sceneIndex] = await tools.synthesizeVoiceForScene({
        scene: newScene,
        voiceConfig: state.input.voiceConfig
    });

    // 6. 重新组装时间线(整条,但只受这一个 scene 影响)
    state.project = await tools.assembleTimeline({ ...state });

    // 7. emit progress
    emit({ type: 'node.progress', message: '重新生成分镜完成', progress: 100 });
    emit({
        type: 'node.completed',
        nodeName: 'regenerate_scene',
        runId: state.runId
    });

    return state;
}
```

### 6.3 时间线组装复用

关键点:**不用重跑 scan_assets / analyze_assets / creative_brief / plan_scenes**,只用前面 checkpoint 里的 state.scenes 数据 + 当前修改 + match_assets + synthesize_voice 增量更新。

### 6.4 单句配音重生(更细粒度)

如果用户只想改一句配音的语速 / 音色:

- 只调 `synthesizeVoiceForSentence`(sentenceId)
- 不重跑 match_assets(素材匹配不变)
- 不重跑 assemble_timeline(时间线不变,只替换 mp3 文件)

---

## 7. 进度上报

详见 `docs/long-task-event-stream.md`(同批待写),本节只列关键事件:

| 事件                | 触发                                               |
| ------------------- | -------------------------------------------------- |
| `run.started`       | controller.start 入口                              |
| `node.started`      | 每个 node 函数入口(由 createInstrumentedNode 包装) |
| `node.completed`    | node 函数返回                                      |
| `node.failed`       | node 抛错                                          |
| `approval.required` | scene_approval 触发 interrupt                      |
| `run.completed`     | 全部 10 节点跑完                                   |
| `run.failed`        | 任一 node 抛错                                     |
| `run.cancelled`     | 用户中途取消                                       |

---

## 8. 模块划分

### 8.1 新增

- `packages/video-agent/src/graph/state.ts` —— `VideoCreationStateAnnotation`
- `packages/video-agent/src/graph/checkpoint.ts` —— `createVideoCreationCheckpointer()` 工厂
- `packages/video-agent/src/graph/nodes.ts` —— 10 个 node + `createInstrumentedNode` 包装
- `packages/video-agent/src/graph/graph.ts` —— `createVideoCreationGraph()` 装配 + start/resume runner
- `packages/video-agent/src/graph/scene-regeneration.ts` —— 增量重生工具函数(详见 scene-regeneration.md)
- `apps/desktop/client/video-agent-scene-regeneration.ts` —— 主进程侧接入
- `apps/desktop/tests/agent-workflow.test.ts` —— 端到端测试

### 8.2 修改

- `packages/video-agent/src/index.ts` —— barrel 加 graph + scene-regeneration
- `packages/video-agent/src/tools/video-agent-tools.ts` —— 加 `rewriteScene / matchAssetsForScene / synthesizeVoiceForScene / assembleTimelineForScene` 细粒度方法
- `apps/desktop/client/video-agent-ipc.ts` —— start/approve 走 graph.invoke + Command.resume
- `apps/desktop/shared/ipc.ts` —— `regenerateScene` 已有 channel(commit 4),handler 接通

---

## 9. 测试矩阵

| 测试                                          | 覆盖                                         |
| --------------------------------------------- | -------------------------------------------- |
| `agent-workflow.test.ts:end-to-end`           | 10 节点直线跑完,断言 run.completed           |
| `agent-workflow.test.ts:interrupt-resume`     | scene_approval interrupt,Command resume 继续 |
| `agent-workflow.test.ts:regenerate-scene`     | 修改 scene[3] 后只重跑 3 个节点              |
| `agent-workflow.test.ts:regenerate-voice`     | 只重生 scene[3] 配音,不重跑 match            |
| `agent-workflow.test.ts:memory-saver-restart` | 进程重启后 checkpoint 丢失,run 标记失败      |
| `agent-workflow.test.ts:cancel-mid-run`       | 中途取消,emit run.cancelled,checkpoint 清除  |
| `agent-workflow.test.ts:error-recovery`       | 单 node 失败,emit node.failed,run.failed     |
| `agent-workflow.test.ts:quality-scoring-loop` | plan §15 方案 2,3 次修订后通过               |
| `agent-workflow.test.ts:state-snapshot`       | 每节点后 state 快照持久化(MemorySaver 验证)  |

---

## 10. 风险

1. **MemorySaver 进程崩溃风险**:本地开发可能频繁 hot-reload,丢 checkpoint 让用户重跑。补救:Phase 5 升级 SqliteSaver。
2. **interrupt + MemorySaver 一致性**:interrupt 后 state 已持久化,resume 读到的 state 必须包含到 interrupt 为止的所有更新。LangGraph 保证这点。
3. **scene-regeneration 状态污染**:修改 scenes[i] 后,后续节点要基于新 scenes 跑,如果老节点被错误地复用旧 state 会出问题。补救:regenerateScene 走独立入口,不复用 LangGraph 自动 resume。
4. **驳回 vs 重生**:reject 整张图走"抛错 + 重 start",重生单分镜走增量工具函数。两条路径并存,UI 入口区分清楚。
5. **Checkpoint 序列化性能**:state.scenes 含 jpg 路径数组,序列化时全部入 checkpoint。10 节点跑完 state 大小约 50KB,可接受。

---

## 11. 引用清单

- **LangGraph 官方文档** — https://langchain-ai.github.io/langgraphjs/
- **LangGraph interrupt** — https://langchain-ai.github.io/langgraphjs/how-tos/human_in_the_loop/
- **LangGraph Checkpointer** — https://langchain-ai.github.io/langgraphjs/concepts/persistence/
- **MemorySaver / SqliteSaver** — https://langchain-ai.github.io/langgraphjs/reference/checkpoints/
- **plan §9 流水线** — `docs/plan-2.0-langgraph.md`
- **增量扫描** — `docs/incremental-scan.md`
- **流式 TTS** — `docs/streaming-tts.md`
- **拼接 + 字幕** — `docs/assemble-and-subtitle.md`
- **长时任务事件流** — `docs/long-task-event-stream.md`
- **局部重生成** — `docs/scene-regeneration.md`
- **自定义音色库** — `docs/custom-voice-library.md`
