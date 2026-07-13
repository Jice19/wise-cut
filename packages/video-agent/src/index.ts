/**
 * @miaoma-magicut/video-agent — Phase 2 commit 3 入口。
 *
 * 当前导出:
 *   - media 子模块(probeMedia + extractKeyframes + 错误类)
 *   - providers/model-provider interface + m3-chat-model-provider 实现
 *   - prompts/frame-description(system + user template)
 *   - providers/llm-json(从 LLM 文本抠 JSON 的纯函数)
 *
 * Phase 2 commit 4 起会加 graph/steps/analyze-assets + IPC tools 接口。
 */

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
    ModelProvider
} from './providers/model-provider';
