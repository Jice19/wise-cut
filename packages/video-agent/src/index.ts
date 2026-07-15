/**
 * @miaoma-magicut/video-agent — Phase 3 commit 6 入口。
 *
 * 当前导出:
 *   - media 子模块(probeMedia + extractKeyframes + 错误类)
 *   - providers/model-provider interface + m3-chat-model-provider 实现
 *   - prompts/frame-description(system + user template)
 *   - providers/llm-json(从 LLM 文本抠 JSON 的纯函数)
 *   - events/agent-run-event(13 事件 Zod union + 类型)
 *   - events/event-emitter(createSequencedEventEmitter + redactSecrets)
 *   - graph/steps/analyze-assets(commit 4)
 *
 * Phase 3 commit 6 起会加 graph/state + graph/nodes + graph/graph
 * + prompts/{creative-brief,scene-planner,asset-matcher}。
 */

export {
    analyzeAssets,
    type AnalyzeAssetsInput,
    createFsVideoAgentTools
} from './graph/steps/analyze-assets';
export {
    extractKeyframes,
    ExtractKeyframesError
} from './media/extract-keyframes';
export {
    NoVideoStreamError,
    probeMedia,
    ProbeMediaError
} from './media/probe-media';
export { VIDEO_AGENT_PACKAGE_NAME } from './package-name';
export {
    buildFrameIdList,
    FRAME_DESCRIPTION_SYSTEM_PROMPT,
    FRAME_DESCRIPTION_USER_PROMPT_TEMPLATE
} from './prompts/frame-description';
export { extractJsonFromLlmResponse } from './providers/llm-json';
export {
    FrameDescriptionSchemaError,
    MinimaxM3ModelProvider,
    type MinimaxM3ModelProviderOptions
} from './providers/m3-chat-model-provider';
export type {
    DescribeFramesInput,
    FrameImage,
    GenerateTextInput,
    GenerateTextResult,
    ModelProvider
} from './providers/model-provider';
export {
    estimateWordTimestamps,
    type TtsWriteResult,
    type VideoAgentTools,
    type WordTimestamp
} from './tools/video-agent-tools';

// Phase 3 commit 6.5 —— prompts 子模块
export {
    ASSET_MATCHER_SYSTEM_PROMPT,
    ASSET_MATCHER_USER_PROMPT_TEMPLATE
} from './prompts/asset-matcher';
export {
    CREATIVE_BRIEF_SYSTEM_PROMPT,
    CREATIVE_BRIEF_USER_PROMPT_TEMPLATE
} from './prompts/creative-brief';
export {
    SCENE_PLANNER_SYSTEM_PROMPT,
    SCENE_PLANNER_USER_PROMPT_TEMPLATE
} from './prompts/scene-planner';

// Phase 3 commit 6 —— events 子模块
export {
    type AgentRunEvent,
    AgentRunEventSchema,
    type AgentRunEventType
} from './events/agent-run-event';
export {
    type AgentRunEventEmitter,
    type AgentRunEventSink,
    createSequencedEventEmitter,
    redactEventPayload,
    redactSecrets,
    type SequencedEventEmitter,
    serializeError
} from './events/event-emitter';

// Phase 3 commit 10 —— graph 子模块( 项目 4 文件规范)
export { createVideoCreationCheckpointer } from './graph/checkpoint';
export {
    createVideoCreationGraph,
    listProjects,
    type VideoCreationGraphResult,
    type VideoCreationGraphRunner
} from './graph/create-video-creation-graph';
export {
    type AssetMatcherPayload,
    type CreativeBriefPayload,
    type SceneApprovalRequest as SceneApprovalRequestPayload,
    type SceneApprovalResume as SceneApprovalResumePayload,
    type ScenePlannerPayload
} from './graph/node-payloads';
export { createVideoCreationNodes, setModelProvider } from './graph/nodes';
export {
    buildInitialState,
    type RunStatus,
    type SceneApprovalRequest,
    type SceneApprovalResume,
    type VideoCreationGraphState,
    type VideoCreationInput,
    VideoCreationStateAnnotation
} from './graph/state';
export { Command } from '@langchain/langgraph';
