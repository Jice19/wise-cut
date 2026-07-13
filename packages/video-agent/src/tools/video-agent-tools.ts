/**
 * 模型可调用的工具接口 —— video-agent 内部用,主进程端实现。
 *
 * 解耦目的:video-agent 是纯逻辑层,不依赖 electron / ffmpeg 二进制路径解析 / IPC。
 * 由 `apps/desktop/client/video-agent-tools.ts` 提供桌面实现,跑在主进程。
 *
 * 本阶段(commit 4)只需要:
 *   - readImageAsBase64DataUrl:把抽帧后的 jpg 文件读成 base64,供 describeFrames 用
 *
 * 后续 commit 5/6 会扩:
 *   - writeMp3 / probeAudioDuration
 *   - ensureBundledBgm(动态生成 demo BGM)
 *   - exportProject(Phase 4 才用)
 */

export interface VideoAgentTools {
    /**
     * 读取本地图片,转成 base64 data URL(M3 多模态用)。
     *
     * 返回格式严格 `data:<mime>;base64,<payload>`,LLM client 直接发 image_url.url。
     */
    readImageAsBase64DataUrl(input: {
        mimeType?: string;
        path: string;
    }): Promise<string>;
}
