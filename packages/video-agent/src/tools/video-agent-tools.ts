/**
 * 模型可调用的工具接口 —— video-agent 内部用,主进程端实现。
 *
 * 解耦目的:video-agent 是纯逻辑层,不依赖 electron / ffmpeg 二进制路径解析 / IPC。
 * 由 `apps/desktop/client/video-agent-tools.ts` 提供桌面实现,跑在主进程。
 *
 * 阶段范围:
 *   - commit 4 阶段:readImageAsBase64DataUrl(给 describeFrames 用)
 *   - commit 6.5 阶段:writeMp3(给 synthesize_voice 用) + writeProject(给
 *     save_project 用)
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

    /**
     * 把 narration 文本合成 mp3 文件,落到 audioFilePath。
     * 走外部 TTS provider(volcengine / minimax),由 desktop 端注入。
     * 失败抛错让 node 走降级路径(voices 数组跳过该 scene)。
     */
    writeMp3(input: {
        audioFilePath: string;
        narration: string;
        voiceId: string;
    }): Promise<void>;

    /**
     * 把 VideoProject 落盘到 outputDir/<projectId>.json,返回落盘路径。
     * 失败抛错让 controller 端 run.failed。
     */
    writeProject(input: {
        outputDir: string;
        projectId: string;
        projectJson: unknown;
    }): Promise<string>;
}
