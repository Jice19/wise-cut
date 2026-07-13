# 开发进度总览

## 2026-07-11—— 项目工程化

- `chore(monorepo): scaffold packages/video-agent and video-project`
- pnpm workspace 接 `apps/*` + `packages/*`,`nodeLinker: hoisted`
- `apps/desktop/package.json` 加 `workspace:*` 依赖
- vitest 配置 `fileURLToPath` 绝对路径 alias(node 环境)
- `apps/desktop/tests/workspace-smoke.test.ts` 验证两包能 import

## 2026-07-12—— UI 调整

- `fix(renderer): unify editor + workspace layout` —— 全宽 + 带边框模块
- `fix(agent-run): add bordered modules + p-2 outer gap`
- `fix(window): hide macOS native title bar` —— 修双顶栏 bug

## 2026-07-13—— 抽帧 + LLM/TTS 边界处理

### probe:media + probe:tts + probe:m3 三个连通性脚本

- `apps/desktop/scripts/api-probe/probe-minimax-m3.ts` —— M3 chat 连通
- `apps/desktop/scripts/api-probe/probe-volcengine-tts.ts` —— 火山 TTS 连通,25965 字节 mp3
- `apps/desktop/scripts/api-probe/probe-media.ts` —— ffmpeg/ffprobe 包装

### ffmpeg/ffprobe 包装层

- `packages/video-agent/src/media/probe-media.ts` —— ffprobe 元数据,区分 `NoVideoStreamError` / `ProbeMediaError`
- `packages/video-agent/src/media/extract-keyframes.ts` —— ffmpeg `-vf fps=1/N,showinfo` + stderr pts_time 解析,真实 `timestampMs`

### LLM 多模态

- `packages/video-agent/src/providers/m3-chat-model-provider.ts` —— base64 image_url,prompt 禁 Markdown,frame id 顺序校验
- `packages/video-agent/src/providers/llm-json.ts` —— 从 LLM 文本抠 JSON(兼容 fenced/chatty)
- `packages/video-agent/src/prompts/frame-description.ts`

### 串成 analyzeAssets

- `packages/video-agent/src/graph/steps/analyze-assets.ts` —— probeMedia + extractKeyframes + describeFrames 三步串成,失败降级不打断流水线
- `packages/video-agent/src/tools/video-agent-tools.ts` —— `VideoAgentTools` interface

### IPC 脚手架

- `apps/desktop/shared/ipc.ts` —— 11 个 channel + 7 个 MiaomaAPI 方法声明(handler 还没接)

### 测试

29 个 vitest 全绿:12 describe-frames + 4 analyze-assets + 3 extract-keyframes + 3 probe-media + 6 schema + 1 workspace smoke。

## 明天计划

按 `docs/plan-2.0-langgraph.md` 推 Phase 3(LangGraph 10 节点端到端):

- 批 1:commit 0a / 0b / 0c(IPC 合并 + preload wire + main stub)
- 批 2:commit 5 / 6 / 7 / 8(demo controller + LangGraph 真接 + schema 大扩 + renderer UI)
