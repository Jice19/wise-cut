- All rights reserved.
# 智剪视频创作智能体设计

## 概述

本设计定义智剪第一版智能视频创作流程：用户提供创作提示词和本地视频片段，系统通过本地优先的智能体流程生成一个可编辑的 `VideoProject JSON`，编辑器读取该 JSON 后展示视频、配音、字幕、音乐四类轨道。

第一阶段只生成可编辑工程文件，不负责最终成片导出。最终导出、低清预览、复杂编辑回写会在工程 JSON 契约稳定后继续扩展。

## 目标

- 从用户提示词生成分镜、文案、字幕和成片结构。
- 自动扫描本地视频素材，分析可用片段并匹配分镜。
- 调用火山引擎 `seed-tts-2.0` 生成配音，并用真实音频时长反推时间线。
- 从固定内置音乐库中选择音乐，生成音乐轨道配置。
- 输出完整、可校验、可恢复编辑的 `VideoProject JSON`。
- 使用 LangChainJS 和 LangGraphJS 实现可恢复、可暂停、可测试的智能体流程。

## 非目标

- 第一阶段不导出最终视频文件。
- 第一阶段不做跨项目长期偏好记忆。
- 第一阶段不做 AI 生成音乐。
- 第一阶段不自动变速视频素材。
- 第一阶段不让 renderer 直接访问本地文件系统或外部 API。

## 架构决策

### 运行位置

智能体运行在 Electron 本地 Node 能力侧。renderer 只负责提交创作意图、展示进度、承接人工确认和打开生成的工程。

这样做的原因：

- 本地视频素材不需要上传才能被扫描。
- `ffmpeg`、`ffprobe`、SQLite、文件读写都更适合在 Electron main 或独立本地 service 中执行。
- 后续即使增加服务端能力，项目 JSON 和素材索引仍然能作为本地事实来源。

### 工程分层

新增 `packages`，避免把领域逻辑堆到 renderer。

- `packages/video-project`
  - 定义 `VideoProject` 的 Zod schema 和 TypeScript 类型。
  - 提供 JSON 校验、fixture、版本迁移入口。
- `packages/video-agent`
  - 定义 LangGraph 主管图、节点、工具接口、provider adapter。
  - 依赖 `video-project`，输出合法 `VideoProject`。
- `apps/desktop/client`
  - 承载 Electron main/preload IPC、文件访问、SQLite、媒体工具调用。
- `apps/desktop/renderer`
  - 只消费 project loading API 和 `VideoProject` 派生出的 UI view model。

### AI 与媒体能力

- LangChainJS：通过 OpenAI-compatible 的 `ChatOpenAI` 接入火山 Ark。
- LangGraphJS：负责长流程编排、checkpoint、interrupt、resume。
- 火山 Ark LLM：用于创作 brief、分镜规划、关键帧视觉理解、素材匹配排序。
- 火山引擎 TTS：通过 `wss://openspeech.bytedance.com/api/v3/plan/tts/unidirectional/stream` 接入 `seed-tts-2.0`。
- `ffprobe`：读取视频、音频真实元数据。
- `ffmpeg`：抽关键帧、生成缩略图，后续扩展到预览和导出。
- SQLite：保存单项目内素材索引、embedding、智能体运行记录和 checkpoint。

## VideoProject JSON

`VideoProject` 是编辑器、智能体、渲染器之间的唯一工程源文件。它不是临时渲染清单，而是可继续编辑、可恢复、可解释的项目状态。

### 顶层结构

```ts
type VideoProject = {
    schemaVersion: '1.0.0';
    project: ProjectMetadata;
    canvas: CanvasConfig;
    assets: ProjectAssets;
    scenes: Scene[];
    tracks: TimelineTrack[];
    render: RenderConfig;
    ai: AiRunMetadata;
};
```

### ProjectMetadata

- `id`: 项目 id。
- `title`: 项目标题。
- `sourcePrompt`: 用户原始提示词。
- `createdAt`: ISO 时间。
- `updatedAt`: ISO 时间。

### CanvasConfig

第一版默认横屏：

- `width`: `1920`
- `height`: `1080`
- `fps`: `30`
- `durationMs`: 由最终配音和时间线计算。
- `safeArea`: 字幕、主体内容安全区域。

### ProjectAssets

素材引用使用 asset id，不把路径散落到 clip 内。

- `videos`: 本地视频素材及分析结果。
- `voices`: TTS 生成的音频。
- `music`: 内置音乐素材。
- `subtitles`: 字幕源和样式预设。
- `thumbnails`: 关键帧和封面缩略图。

### Scene

每个分镜包含：

- `id`
- `index`
- `title`
- `goal`
- `script`
- `visualIntent`
- `durationMs`
- `matchedVideoAssetIds`
- `voiceAssetId`
- `subtitleIds`
- `notes`

### TimelineTrack

第一版固定四类轨道：

- `video`
- `voice`
- `subtitle`
- `music`

Clip 使用判别联合：

- `VideoClip`: 引用视频 asset、source in/out、timeline in/out、crop、transform。
- `VoiceClip`: 引用 TTS 音频、timeline in/out、voice preset。
- `SubtitleClip`: 引用字幕文本、timeline in/out、style preset。
- `MusicClip`: 引用内置音乐、timeline in/out、source in/out、volume、fade。

所有时间统一使用毫秒。所有跨结构引用使用 branded id，schema 校验必须检查引用存在性和时间合法性。

## 智能体流程

使用一个 LangGraph 主管图串起所有节点。每个节点职责单一，输入输出结构化，便于测试和恢复。

### 节点

1. `CollectInputNode`
   - 输入用户提示词、素材目录、横屏配置、TTS 音色。
2. `AssetScanNode`
   - 调用 `ffprobe` 扫描视频元数据。
   - 调用 `ffmpeg` 抽关键帧。
3. `AssetUnderstandNode`
   - 用 OpenAI 视觉能力描述关键帧。
   - 生成素材标签、情绪、场景、可用区间和 embedding。
4. `CreativeBriefNode`
   - 从用户提示词提炼主题、受众、风格、节奏和限制。
5. `ScenePlannerNode`
   - 生成分镜、文案、字幕初稿。
   - 输出必须通过 Zod schema。
6. `SceneApprovalNode`
   - interrupt，等待用户确认分镜大纲。
7. `AssetMatcherNode`
   - 按分镜语义检索素材，选择素材区间。
8. `MatchApprovalNode`
   - interrupt，等待用户确认素材匹配。
9. `TtsNode`
   - 调用火山 `seed-tts-2.0` WebSocket 单向流式接口生成配音。
   - 用 `ffprobe` 获取真实音频时长。
10. `DurationAlignNode`
    - 用配音真实时长调整分镜、字幕和视频 clip 时长。
11. `TimelineAssembleNode`
    - 组装四轨时间线。
12. `ValidationNode`
    - 校验 `VideoProject` schema、引用和时间线约束。
13. `ProjectSaveNode`
    - 写入工程 JSON，记录 run 状态。

### 人工确认点

第一版只在关键节点暂停：

- 分镜大纲确认。
- 素材匹配确认。
- 最终时间线确认。

这样可以保持自动化，同时避免 AI 一路生成到无法解释的错误结果。

## 工具设计

工具以接口形式注入 LangGraph 节点，单元测试使用 fake tools。

- `scanVideoDirectory`
- `probeMedia`
- `extractKeyframes`
- `describeFrames`
- `embedAssetText`
- `searchAssetSegments`
- `planScenes`
- `matchSceneAssets`
- `synthesizeVoice`
- `probeAudioDuration`
- `selectBuiltInMusic`
- `validateProject`
- `writeProjectJson`

所有外部 API 都必须被 provider adapter 包起来。节点不直接读取环境变量，不直接拼接 HTTP/WebSocket 请求。

### TTS 协议模块

火山 TTS Provider 使用 TypeScript 复刻 WebSocket 单向流式示例。协议编解码必须独立于 provider，避免 provider 文件同时承担协议、配置、文件写入和错误处理。

建议模块：

- `tts-protocol/types.ts`
  - `MsgType`
  - `EventType`
  - `TtsProtocolMessage`
- `tts-protocol/full-client-request.ts`
  - 将完整请求 body 编码为火山 WebSocket 协议消息。
- `tts-protocol/receive-message.ts`
  - 解码服务端消息。
  - 支持音频 chunk、`SessionFinished`、error message。
- `providers/volcengine-tts-provider.ts`
  - 连接 `wss://openspeech.bytedance.com/api/v3/plan/tts/unidirectional/stream`。
  - headers 使用 `X-Api-Key`、`X-Api-Resource-Id`、`X-Control-Require-Usage-Tokens-Return`。
  - 收集 `AudioOnlyServer` payload，`SessionFinished` 后写入 mp3。
  - 所有错误转换为结构化 provider error，不泄露 API key。

## 本地存储

SQLite 用于项目内状态，不做跨项目偏好记忆。

建议表：

- `projects`
- `agent_runs`
- `asset_segments`
- `asset_embeddings`
- `graph_checkpoints`
- `ai_decisions`

项目 JSON 是工程源文件。SQLite 是检索、恢复、运行记录和索引层。

## 配置

配置必须从本地安全配置读取，不能写死到业务代码。

### dotenv

使用 dotenv 承载模型相关配置。仓库只提交 `.env.example`，真实配置只放本地 `.env.local`。`.gitignore` 必须忽略 `.env`、`.env.local`、`.env.*`，并保留 `.env.example`。

`.env.example`：

```dotenv
LLM_MODEL=doubao-seed-2.0-pro
TTS_MODEL=seed-tts-2.0
BASE_URL=https://ark.cn-beijing.volces.com/api/plan/v3
API_KEY=replace-with-your-volcengine-ark-api-key
```

`API_KEY` 同时供 Ark LLM 和火山 TTS provider 使用。真实 key 不进入 `VideoProject JSON`、日志、SQLite event payload 或 renderer。

如果真实 API key 曾经出现在聊天记录、终端日志或截图中，应在火山控制台轮换后再进入开发联调。

### Ark LLM 配置

使用 `@langchain/openai` 的 `ChatOpenAI`，通过 OpenAI-compatible base URL 接入火山 Ark：

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

`streamUsage: false` 用于兼容不支持 `stream_options` 的 OpenAI-compatible provider。

火山 TTS 配置：

- WebSocket endpoint 固定为 `wss://openspeech.bytedance.com/api/v3/plan/tts/unidirectional/stream`
- `X-Api-Key`: `env.API_KEY`
- `X-Api-Resource-Id`: `env.TTS_MODEL`
- voice
- audio format

媒体工具配置：

- `ffmpeg` path
- `ffprobe` path
- temp directory
- project directory

## 构建策略

新增 package 使用 tsdown 构建，统一输出 ESM 和类型声明。

- `packages/video-project`
  - 面向共享 schema library。
  - `tsdown.config.ts` 使用 `defineConfig({ entry: ['./src/index.ts'], dts: true, format: ['esm'] })`。
- `packages/video-agent`
  - 面向 Electron main / Node 运行环境。
  - `tsdown.config.ts` 使用 `platform: 'node'`，Node builtins 和外部 SDK 保持 external。
- package scripts：
  - `build`: `tsdown`
  - `dev`: `tsdown --watch`
  - `typecheck`: `tsc --noEmit`
  - `test:run`: `vitest run`

tsdown 作为构建时依赖，需要 Node.js `22.18.0+` 作为构建环境；运行产物的目标版本通过 `target` 单独控制。

## 执行输出与 UI 可观测性

智能体运行过程必须通过 typed event stream 输出，不能只等待最终 JSON。

新增 `AgentRunEvent` 判别联合：

- `run.started`
- `node.started`
- `node.output`
- `node.completed`
- `tool.started`
- `tool.output`
- `tool.completed`
- `model.token`
- `approval.required`
- `approval.resolved`
- `tts.audio-chunk`
- `run.completed`
- `run.failed`
- `run.cancelled`

事件要求：

- 每个事件包含 `runId`、`sequence`、`timestamp`、`type`、`payload`。
- payload 不包含 API key、原始环境变量、绝对敏感路径。
- Electron main 将事件写入 SQLite，并通过 IPC 推送 renderer。
- renderer 后续可展示节点进度、模型流式输出、工具调用、确认请求和错误重试。

## 编辑器接入

编辑器不直接理解智能体内部状态，只读取 `VideoProject` 并派生 UI view model。

第一版接入策略：

- 当前静态 `editor-screen` 数据保留为 fallback fixture。
- 新增从 `VideoProject` 派生 timeline 的 mapper。
- 编辑器先只读加载项目 JSON。
- 暂不做复杂编辑回写，避免在 schema 未稳定前扩大范围。

## 测试策略

- schema 测试覆盖合法项目、非法时间、非法引用、轨道类型错配。
- 工具测试使用本地 fixture，不真实调用外部 API。
- LangGraph 流程测试使用 fake model、fake TTS、fake media tools。
- Electron IPC 测试覆盖保存、读取、校验失败。
- renderer 测试覆盖从 fixture `VideoProject` 渲染四轨时间线。

## 关键约束

- 不自动提交 commit。
- 不把智能体、文件系统、API key 暴露给 renderer。
- 不让 AI 输出绕过 schema 校验。
- 不在第一版引入最终导出、AI 音乐生成、跨项目长期记忆。
- 不用视频变速硬凑时长，优先裁剪、补素材、调整字幕分段。

## 参考资料

- tsdown Getting Started: `https://tsdown.dev/guide/getting-started`
- LangChainJS ChatOpenAI: `https://docs.langchain.com/oss/javascript/integrations/chat/openai`
- 火山豆包语音 WebSocket V3: `https://www.volcengine.com/docs/6561/1329505`
