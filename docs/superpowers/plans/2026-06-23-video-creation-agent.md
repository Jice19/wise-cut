- All rights reserved.
# 智剪视频创作智能体 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 渐进式实现从用户提示词和本地视频素材生成可编辑 `VideoProject JSON` 的本地智能体能力。

**Architecture:** 新增 `packages/video-project` 管理工程 JSON schema，新增 `packages/video-agent` 管理 LangGraph 编排和工具接口，Electron main/preload 承担本地文件、SQLite、媒体工具和外部 API 访问，renderer 只消费受控 API 和 view model。

**Tech Stack:** TypeScript, pnpm workspace, Zod, Vitest, tsdown, dotenv, Electron Forge, LangChainJS, LangGraphJS, Ark/OpenAI-compatible ChatOpenAI, 火山引擎 seed-tts-2.0 WebSocket, ffmpeg, ffprobe, node:sqlite.

**Execution note:** 不自动 commit。每批完成后只汇报验证结果；如果需要提交，必须由用户明确要求并再次确认。

---

## Batch 0: 文档落盘

**目标：** 创建设计文档和渐进式实施计划，不改业务代码。

**Files:**

- Create: `docs/superpowers/specs/2026-06-23-video-creation-agent-design.md`
- Create: `docs/superpowers/plans/2026-06-23-video-creation-agent.md`

**Steps:**

- [ ] 创建设计文档，覆盖架构、JSON 契约、智能体流程、工具、存储、测试策略。
- [ ] 创建实施计划，按 Batch 0-8 拆分，每批具备独立验收标准。
- [ ] 运行文档存在性校验：

```bash
test -f "docs/superpowers/specs/2026-06-23-video-creation-agent-design.md"
test -f "docs/superpowers/plans/2026-06-23-video-creation-agent.md"
```

- [ ] 运行内容校验：

```bash
rg -n "VideoProject|LangGraph|SQLite|火山|ffmpeg|Batch 8" "docs/superpowers/specs/2026-06-23-video-creation-agent-design.md" "docs/superpowers/plans/2026-06-23-video-creation-agent.md"
```

**Acceptance Criteria:**

- 两个 md 文件存在。
- 文档覆盖 JSON、智能体、工具、存储、测试策略。
- `git status --short` 只出现两个新增文档。

---

## Batch 0.1: dotenv、tsdown、TTS 协议与事件流补充

**目标：** 将新增的模型配置、构建工具、火山 TTS TypeScript 实现方式和智能体执行输出策略补充进设计与计划。

**Files:**

- Modify: `.gitignore`
- Create: `.env.example`
- Modify: `docs/superpowers/specs/2026-06-23-video-creation-agent-design.md`
- Modify: `docs/superpowers/plans/2026-06-23-video-creation-agent.md`

**Implementation:**

- `.gitignore` 忽略 `.env`、`.env.local`、`.env.*`，并保留 `.env.example`。
- `.env.example` 只包含 placeholder，不写真实 API key：

```dotenv
LLM_MODEL=doubao-seed-2.0-pro
TTS_MODEL=seed-tts-2.0
BASE_URL=https://ark.cn-beijing.volces.com/api/plan/v3
API_KEY=replace-with-your-volcengine-ark-api-key
```

- 文档明确 LLM 使用 `@langchain/openai` 的 `ChatOpenAI`：

```ts
new ChatOpenAI({
    model: env.LLM_MODEL,
    apiKey: env.API_KEY,
    streamUsage: false,
    configuration: {
        baseURL: env.BASE_URL
    }
});
```

- 文档明确火山 TTS 使用 TypeScript WebSocket 单向流式实现，并拆分 `tts-protocol` 模块。
- 文档明确 `packages/video-project`、`packages/video-agent` 使用 tsdown 构建。
- 文档明确 `AgentRunEvent` 事件流，用于后续 UI 展示执行过程。

**Tests:**

- `.env.example` 不包含真实 API key。
- 文档包含 `dotenv`、`tsdown`、`AgentRunEvent`、`volcengine-tts-provider`、`ChatOpenAI`。
- `git diff --check` 无空白问题。

**Verification:**

```bash
test -f ".env.example"
rg -n "replace-with-your-volcengine-ark-api-key" ".env.example"
rg -n "dotenv|tsdown|AgentRunEvent|volcengine-tts-provider|ChatOpenAI|streamUsage" "docs/superpowers/specs/2026-06-23-video-creation-agent-design.md" "docs/superpowers/plans/2026-06-23-video-creation-agent.md"
git diff --check
```

---

## Batch 1: `packages/video-project` 工程 JSON 契约

**目标：** 建立 `VideoProject` 的唯一工程源文件契约。

**Files:**

- Create: `packages/video-project/package.json`
- Create: `packages/video-project/tsconfig.json`
- Create: `packages/video-project/src/index.ts`
- Create: `packages/video-project/src/schema.ts`
- Create: `packages/video-project/src/types.ts`
- Create: `packages/video-project/src/validation.ts`
- Create: `packages/video-project/src/fixtures/sample-project.ts`
- Create: `packages/video-project/tests/video-project-schema.test.ts`
- Create: `packages/video-project/tsdown.config.ts`

**Implementation:**

- 使用 Zod 定义 `VideoProjectSchema`。
- 导出 `VideoProject`、`Scene`、`TimelineTrack`、`VideoClip`、`VoiceClip`、`SubtitleClip`、`MusicClip` 类型。
- 所有时间字段使用 `startMs`、`endMs`、`durationMs`。
- clip 使用 `kind` 判别联合。
- `validateVideoProject(project)` 返回 `{ success: true; data } | { success: false; issues }`。
- `assertVideoProject(project)` 校验失败时抛出带 issues 的错误。
- package scripts 使用 `build: tsdown`、`dev: tsdown --watch`、`typecheck: tsc --noEmit`、`test:run: vitest run`。
- `tsdown.config.ts` 输出 ESM 和 `.d.ts`。
- `VideoProject` 不保存 API key、dotenv 原始值或 provider secret。

**Tests:**

- 合法 fixture 通过。
- `endMs <= startMs` 失败。
- clip 引用不存在 asset id 失败。
- `video` 轨道出现 `voice` clip 失败。

**Verification:**

```bash
pnpm --filter @wise-cut/video-project test:run
pnpm --filter @wise-cut/video-project build
pnpm --filter @wise-cut/video-project lint
pnpm --filter @wise-cut/video-project typecheck
```

---

## Batch 2: 本地项目文件读写

**目标：** Electron main/preload 提供受控项目文件 API，renderer 不直接访问文件系统。

**Files:**

- Modify: `apps/desktop/client/main.ts`
- Modify: `apps/desktop/client/preload.ts`
- Create: `apps/desktop/client/video-project-ipc.ts`
- Create: `apps/desktop/client/video-project-store.ts`
- Modify: `apps/desktop/miaoma.env.d.ts`
- Create: `apps/desktop/tests/video-project-store.test.ts`

**Implementation:**

- 增加 IPC：
  - `videoProject:create`
  - `videoProject:read`
  - `videoProject:save`
  - `videoProject:validate`
- preload 暴露 `window.miaomaAPI.videoProject`。
- main 侧读写 JSON 前后都调用 `@wise-cut/video-project` 校验。
- API 返回结构化结果：`{ success: true; data }` 或 `{ success: false; error }`。

**Tests:**

- 保存合法工程 JSON 后可读取。
- 保存非法 JSON 返回校验错误。
- renderer API 类型不暴露 Node fs/path。

**Verification:**

```bash
pnpm --filter @wise-cut/desktop test:run
pnpm exec tsc --noEmit -p "apps/desktop/tsconfig.json"
```

---

## Batch 3: 本地素材扫描与 SQLite 索引

**目标：** 扫描本地视频素材，建立项目内素材索引。

**Files:**

- Create: `packages/video-agent/src/media/probe-media.ts`
- Create: `packages/video-agent/src/media/extract-keyframes.ts`
- Create: `packages/video-agent/src/storage/create-agent-database.ts`
- Create: `packages/video-agent/src/storage/schema.sql.ts`
- Create: `packages/video-agent/tests/media-scan.test.ts`
- Create: `packages/video-agent/tests/agent-database.test.ts`

**Implementation:**

- `probeMedia({ filePath, ffprobePath })` 返回 duration、width、height、fps、codec。
- `extractKeyframes({ filePath, outputDir, ffmpegPath })` 生成关键帧图片。
- SQLite 优先使用 `node:sqlite`。
- 建表：
  - `projects`
  - `agent_runs`
  - `asset_segments`
  - `asset_embeddings`
  - `graph_checkpoints`
  - `ai_decisions`

**Tests:**

- 使用 fixture 视频验证 `probeMedia`。
- 使用临时目录验证关键帧文件生成。
- SQLite 初始化后表存在。

**Verification:**

```bash
pnpm --filter @wise-cut/video-agent test:run
pnpm --filter @wise-cut/video-agent exec tsc --noEmit
```

---

## Batch 4: Ark LLM Provider 与结构化链路

**目标：** 建立 LangChainJS + Ark/OpenAI-compatible 的 provider adapter，并用结构化输出约束 AI 结果。

**Files:**

- Create: `packages/video-agent/src/providers/model-provider.ts`
- Create: `packages/video-agent/src/providers/ark-chat-model-provider.ts`
- Create: `packages/video-agent/src/config/load-agent-env.ts`
- Create: `packages/video-agent/src/prompts/creative-brief.ts`
- Create: `packages/video-agent/src/prompts/scene-planner.ts`
- Create: `packages/video-agent/src/prompts/frame-description.ts`
- Create: `packages/video-agent/src/prompts/asset-matcher.ts`
- Create: `packages/video-agent/tests/model-provider.test.ts`
- Create: `packages/video-agent/tests/load-agent-env.test.ts`

**Implementation:**

- 定义 `ModelProvider` 接口：
  - `generateCreativeBrief`
  - `planScenes`
  - `describeFrames`
  - `rankAssetMatches`
  - `embedTexts`
- `loadAgentEnv()` 使用 dotenv 读取并校验 `LLM_MODEL`、`TTS_MODEL`、`BASE_URL`、`API_KEY`。
- Ark 实现内部使用 `@langchain/openai` 的 `ChatOpenAI`。
- `ChatOpenAI` 初始化传入 `model: env.LLM_MODEL`、`apiKey: env.API_KEY`、`configuration.baseURL: env.BASE_URL`、`streamUsage: false`。
- 模型名、base URL、API key、timeout、retry 通过 config 注入。
- 所有 AI 输出都经过 Zod schema parse。
- 错误日志和 event payload 必须脱敏，不输出 `API_KEY`。

**Tests:**

- fake provider 返回固定结构时 parse 成功。
- 缺少必填字段时返回结构化错误。
- 素材匹配排序结果只包含候选 asset id。
- 缺少 dotenv 必填项时返回明确配置错误。
- provider event payload 不包含 API key。

**Verification:**

```bash
pnpm --filter @wise-cut/video-agent test:run
pnpm --filter @wise-cut/video-agent build
pnpm --filter @wise-cut/video-agent lint
```

---

## Batch 5: LangGraph 主管图

**目标：** 实现可暂停、可恢复、可测试的创作主管图。

**Files:**

- Create: `packages/video-agent/src/graph/create-video-creation-graph.ts`
- Create: `packages/video-agent/src/graph/state.ts`
- Create: `packages/video-agent/src/graph/nodes.ts`
- Create: `packages/video-agent/src/graph/checkpoint.ts`
- Create: `packages/video-agent/src/tools/video-agent-tools.ts`
- Create: `packages/video-agent/src/events/agent-run-event.ts`
- Create: `packages/video-agent/src/events/event-emitter.ts`
- Create: `packages/video-agent/tests/video-creation-graph.test.ts`

**Implementation:**

- 状态包含 input、assets、brief、scenes、approvals、tts、project、errors。
- 节点：
  - collect input
  - asset scan
  - asset understand
  - creative brief
  - scene planner
  - scene approval interrupt
  - asset matcher
  - match approval interrupt
  - tts
  - duration align
  - timeline assemble
  - validation
  - project save
- checkpoint 写入 SQLite。
- interrupt 用于等待用户确认。
- graph 创建时注入 `emit(event)`。
- graph 返回 `runId`，运行过程通过 `AgentRunEvent` 观察。
- 每个节点至少发出 `node.started` 和 `node.completed`；失败时发出 `run.failed`。

**Tests:**

- fake tools happy path 输出合法 `VideoProject`。
- 分镜确认前 graph 停在 approval 状态。
- resume 后继续素材匹配。
- validation 失败时状态包含可读错误。
- happy path 至少发出 `run.started`、`node.started`、`node.completed`、`approval.required`、`run.completed`。
- 错误路径发出 `run.failed`，payload 不包含 API key。

**Verification:**

```bash
pnpm --filter @wise-cut/video-agent test:run
pnpm --filter @wise-cut/video-agent exec tsc --noEmit
```

---

## Batch 6: 火山 TTS Adapter 与 WebSocket 协议

**目标：** 接入火山 `seed-tts-2.0`，并用真实音频时长驱动时间线。

**Files:**

- Create: `packages/video-agent/src/providers/tts-provider.ts`
- Create: `packages/video-agent/src/providers/volcengine-tts-provider.ts`
- Create: `packages/video-agent/src/providers/tts-protocol/types.ts`
- Create: `packages/video-agent/src/providers/tts-protocol/full-client-request.ts`
- Create: `packages/video-agent/src/providers/tts-protocol/receive-message.ts`
- Create: `packages/video-agent/src/audio/probe-audio-duration.ts`
- Create: `packages/video-agent/tests/tts-provider.test.ts`
- Create: `packages/video-agent/tests/tts-protocol.test.ts`

**Implementation:**

- 定义 `TtsProvider.synthesizeSpeech({ text, voice, outputPath, emit })`。
- 火山配置：
  - WebSocket endpoint: `wss://openspeech.bytedance.com/api/v3/plan/tts/unidirectional/stream`
  - `X-Api-Key`: `env.API_KEY`
  - `X-Api-Resource-Id`: `env.TTS_MODEL`
  - `X-Control-Require-Usage-Tokens-Return`: `*`
  - voice
- WebSocket body:
  - `req_params.speaker`
  - `req_params.text`
  - `req_params.audio_params.format`: `mp3`
  - `req_params.audio_params.sample_rate`: `24000`
- `fullClientRequest`、`receiveMessage`、`MsgType`、`EventType` 放在 `tts-protocol` 模块。
- 音频 chunk 追加到 buffer，`SessionFinished` 后写入 mp3。
- `MsgType.Error` 转为结构化 provider error，并 emit 到 run event stream。
- 生成后用 `ffprobe` 读取真实 duration。

**Tests:**

- fake TTS 写入 fixture 音频后返回 duration。
- TTS 失败返回 provider error，不让 graph 崩溃。
- voice clip duration 与音频 duration 对齐。
- fake WebSocket 测试协议解码：audio chunk、session finished、error event。
- TTS event payload 不包含 API key。

**Verification:**

```bash
pnpm --filter @wise-cut/video-agent test:run
pnpm --filter @wise-cut/video-agent lint
```

---

## Batch 7: 编辑器加载真实工程 JSON

**目标：** 编辑器从 `VideoProject` 派生时间线 UI 数据，先只读加载。

**Files:**

- Create: `apps/desktop/renderer/mappers/video-project-to-editor.ts`
- Modify: `apps/desktop/renderer/pages/MiaojianEditorScreen.tsx`
- Modify: `apps/desktop/renderer/components/TimelinePanel.tsx`
- Create: `apps/desktop/tests/video-project-editor-mapper.test.ts`

**Implementation:**

- mapper 输入 `VideoProject`，输出当前编辑器需要的 storyboard、timeline tracks、clips。
- 当前静态数据保留为 fallback。
- `/editor/:projectId` 读取项目 JSON 后渲染。
- 不在本批实现复杂编辑回写。

**Tests:**

- fixture `VideoProject` 渲染 9 个分镜。
- 渲染视频、配音、字幕、音乐四轨。
- clip 宽度按时间比例派生。
- project load 失败时 fallback 不破坏页面。

**Verification:**

```bash
pnpm --filter @wise-cut/desktop test:run -- --runInBand
pnpm exec eslint "apps/desktop/renderer/mappers/video-project-to-editor.ts" "apps/desktop/renderer/pages/MiaojianEditorScreen.tsx" "apps/desktop/renderer/components/TimelinePanel.tsx"
pnpm exec tsc --noEmit -p "apps/desktop/tsconfig.json"
```

---

## Batch 8: 集成验收与错误恢复

**目标：** 串起创作入口到智能体运行再到编辑器打开项目的完整体验。

**Files:**

- Modify: `apps/desktop/renderer/components/create/CreateInputPanel.tsx`
- Modify: `apps/desktop/renderer/pages/MiaojianWorkspaceScreen.tsx`
- Create: `apps/desktop/renderer/components/create/CreateAgentProgress.tsx`
- Modify: `apps/desktop/client/preload.ts`
- Modify: `apps/desktop/client/main.ts`
- Create: `apps/desktop/tests/create-agent-flow.test.ts`

**Implementation:**

- 创作按钮提交：
  - prompt
  - selected voice
  - local asset directory
  - default canvas config
- UI 展示：
  - scanning assets / 正在分析素材
  - planning scenes / 正在生成分镜
  - model token stream / 模型流式输出
  - waiting scene approval / 等待分镜确认
  - matching assets / 正在匹配素材
  - waiting match approval / 等待素材确认
  - generating voice / 正在生成配音
  - assembling timeline / 正在组装时间线
  - completed / 已完成
  - failed / 已失败
- preload 暴露：
  - `miaomaAPI.videoAgent.start()`
  - `miaomaAPI.videoAgent.onEvent()`
  - `miaomaAPI.videoAgent.approve()`
  - `miaomaAPI.videoAgent.cancel()`
- 完成后跳转 `/editor/:projectId`。
- 错误状态展示可读原因和重试入口。

**Tests:**

- 无素材目录时返回可读错误。
- 模型结构化输出失败时停在 failed。
- TTS 失败时可重试。
- 用户取消确认时 run 状态为 cancelled。
- happy path 完成后路由进入 editor。
- renderer 能订阅 `AgentRunEvent` 并按 `sequence` 顺序展示。
- 用户确认事件能 resume graph。

**Verification:**

```bash
pnpm test:run
pnpm lint
pnpm exec tsc --noEmit -p "apps/desktop/tsconfig.json"
```

---

## Global Acceptance Criteria

- `VideoProject JSON` 是智能生成和编辑器加载的唯一工程源文件。
- renderer 不直接访问文件系统、SQLite、OpenAI 或火山 TTS。
- 外部 API 全部通过 provider adapter 注入。
- LangGraph 支持 checkpoint、resume、interrupt。
- 单元测试不真实调用 OpenAI 或火山。
- 第一阶段能从 fixture 输入生成合法项目 JSON，并在编辑器四轨时间线中展示。
- 真实 API key 只允许出现在本地 `.env.local`，不能进入 `.env.example`、docs、SQLite event payload 或 renderer。

## References

- tsdown Getting Started: `https://tsdown.dev/guide/getting-started`
- LangChainJS ChatOpenAI: `https://docs.langchain.com/oss/javascript/integrations/chat/openai`
- 火山豆包语音 WebSocket V3: `https://www.volcengine.com/docs/6561/1329505`
