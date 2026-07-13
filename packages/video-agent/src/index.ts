/**
 * @miaoma-magicut/video-agent — Phase 2 commit 2 入口。
 *
 * 当前导出 media 子模块(probeMedia + extractKeyframes + 错误类)。
 * Phase 2 commit 3 起会陆续加 providers / agents / pipeline。
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
