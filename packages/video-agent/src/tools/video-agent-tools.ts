/**
 * 模型可调用的工具接口 —— video-agent 内部用,主进程端实现。
 *
 * 解耦目的:video-agent 是纯逻辑层,不依赖 electron / ffmpeg 二进制路径解析 / IPC。
 * 由 `apps/desktop/client/video-agent-tools.ts` 提供桌面实现,跑在主进程。
 *
 * 阶段范围:
 *   - commit 4 阶段:readImageAsBase64DataUrl(给 describeFrames 用)
 *   - commit 6.5 阶段:writeMp3 / writeProject
 *   - commit 13 阶段:writeMp3 返回 word-level timestamps(给 SRT 字幕用)
 */

export type WordTimestamp = {
    endMs: number;
    startMs: number;
    word: string;
};

export type TtsWriteResult = {
    audioFilePath: string;
    wordTimestamps: WordTimestamp[];
};

export interface VideoAgentTools {
    /**
     * 读取本地图片,转成 base64 data URL(M3 多模态用)。
     */
    readImageAsBase64DataUrl(input: {
        mimeType?: string;
        path: string;
    }): Promise<string>;

    /**
     * 把 narration 文本合成 mp3 文件 + 返回字级时间戳。
     *
     * commit 13 增强:返回 wordTimestamps(每字 startMs/endMs),让
     * synthesize_voice 节点用其生成精确到字的 SRT 字幕。
     *
     * 失败抛错让 node 走降级路径(voices 数组跳过该 scene)。
     */
    writeMp3(input: {
        audioFilePath: string;
        narration: string;
        voiceId: string;
    }): Promise<TtsWriteResult>;

    /**
     * 把 VideoProject 落盘到 outputDir/<projectId>.json,返回落盘路径。
     */
    writeProject(input: {
        outputDir: string;
        projectId: string;
        projectJson: unknown;
    }): Promise<string>;
}
// ---------------------------------------------------------------------------
// commit 13: SRT 字幕生成 + 字级时间戳工具
// ---------------------------------------------------------------------------

/**
 * commit 13 — 把 wordTimestamps 转成 SRT 格式。
 *
 * SRT 格式:
 *   1\n
 *   00:00:01,234 --> 00:00:02,567\n
 *   字幕文本\n
 *   \n
 *
 * 字级时间戳 → 词组:每 4 字一组(避免一行单字太碎)。
 * 时间戳 0 跳过(避免字幕从 0:00 开始,看起来假)。
 */
export const wordTimestampsToSrt = (
    words: readonly WordTimestamp[],
    options: { wordsPerLine?: number; sceneStartMs?: number } = {}
): string => {
    const wordsPerLine = options.wordsPerLine ?? 4;
    const sceneStartMs = options.sceneStartMs ?? 0;
    const offset = sceneStartMs;

    if (words.length === 0) return '';

    const groups: WordTimestamp[][] = [];
    for (let i = 0; i < words.length; i += wordsPerLine) {
        groups.push(words.slice(i, i + wordsPerLine));
    }

    const formatTimestamp = (ms: number): string => {
        const total = Math.max(0, Math.round(ms));
        const h = Math.floor(total / 3_600_000);
        const m = Math.floor((total % 3_600_000) / 60_000);
        const s = Math.floor((total % 60_000) / 1000);
        const milli = total % 1000;
        return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(milli).padStart(3, '0')}`;
    };

    return groups
        .map((group, idx) => {
            const first = group[0]!;
            const last = group[group.length - 1]!;
            const text = group.map((w) => w.word).join(' ');

            return `${idx + 1}\n${formatTimestamp(first.startMs + offset)} --> ${formatTimestamp(last.endMs + offset)}\n${text}\n`;
        })
        .join('\n');
};

/**
 * commit 13 — 把 narration 文本按字符均分估算字级时间戳。
 *
 * 没有真实 TTS 字级时间戳时 fallback 用:每字按时长 / 字数 平分。
 * 精度比真 TTS 差但能落 SRT 字幕文件(后续 commit 14 接入真 TTS 时替换)。
 */
export const estimateWordTimestamps = (
    narration: string,
    durationMs: number
): WordTimestamp[] => {
    // 中文按字 / 英文按词拆分
    const tokens = narration.match(/[一-龥]|[a-zA-Z]+|\d+/g) ?? [];
    if (tokens.length === 0) return [];
    const perToken = durationMs / tokens.length;
    return tokens.map((token, idx) => ({
        endMs: Math.round((idx + 1) * perToken),
        startMs: Math.round(idx * perToken),
        word: token
    }));
};
