/**
 * 视频素材元数据 —— ffprobe 探针。
 *
 * 行为:
 *   - 跑 `ffprobe -v error -print_format json -show_format -show_streams <file>`
 *   - 从首个 video stream 解出 codecName / width / height / fps
 *   - duration 优先取 stream.duration,fallback 到 format.duration(纯音频文件场景)
 *   - hasAudio = 是否存在 audio stream
 *
 * 失败:
 *   - 没有 video stream → 抛 `NoVideoStreamError`(携带 filePath),不静默
 *   - 其他解析错误 → 抛 `ProbeMediaError`
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import { MediaMetadataSchema } from '@miaoma-magicut/video-project';
import { z } from 'zod';

const execFileAsync = promisify(execFile);

const FfprobeStreamSchema = z.object({
    codec_name: z.string().optional(),
    codec_type: z.string().optional(),
    duration: z.string().optional(),
    height: z.number().int().optional(),
    r_frame_rate: z.string().optional(),
    width: z.number().int().optional()
});

const FfprobeOutputSchema = z.object({
    format: z
        .object({
            duration: z.string().optional()
        })
        .optional(),
    streams: z.array(FfprobeStreamSchema).optional()
});

const parseSecondsToMs = (value: string | undefined): number => {
    const seconds = Number(value);

    if (!Number.isFinite(seconds)) {
        return 0;
    }

    return Math.round(seconds * 1000);
};

const parseFrameRate = (value: string | undefined): number => {
    if (!value) {
        return 0;
    }

    const [rawNumerator, rawDenominator] = value.split('/');
    const numerator = Number(rawNumerator);
    const denominator = Number(rawDenominator ?? 1);

    if (
        !Number.isFinite(numerator) ||
        !Number.isFinite(denominator) ||
        denominator === 0
    ) {
        return 0;
    }

    return Math.round((numerator / denominator) * 1000) / 1000;
};

export class NoVideoStreamError extends Error {
    constructor(readonly filePath: string) {
        super(`No video stream found in ${filePath}`);
        this.name = 'NoVideoStreamError';
    }
}

export class ProbeMediaError extends Error {
    constructor(
        message: string,
        readonly options: { cause?: unknown; filePath?: string } = {}
    ) {
        super(message);
        this.name = 'ProbeMediaError';
    }
}

export const probeMedia = async ({
    ffprobePath,
    filePath
}: {
    ffprobePath: string;
    filePath: string;
}) => {
    let stdout: string;

    try {
        const result = await execFileAsync(ffprobePath, [
            '-v',
            'error',
            '-print_format',
            'json',
            '-show_format',
            '-show_streams',
            filePath
        ]);
        stdout = result.stdout;
    } catch (error) {
        throw new ProbeMediaError(
            `ffprobe failed for ${filePath}: ${(error as Error).message}`,
            { cause: error, filePath }
        );
    }

    const parsed = FfprobeOutputSchema.safeParse(JSON.parse(stdout));

    if (!parsed.success) {
        throw new ProbeMediaError(
            `Failed to parse ffprobe output for ${filePath}`,
            { cause: parsed.error, filePath }
        );
    }

    const { format, streams } = parsed.data;
    const videoStream = streams?.find((s) => s.codec_type === 'video');

    if (!videoStream) {
        throw new NoVideoStreamError(filePath);
    }

    const hasAudio = streams?.some((s) => s.codec_type === 'audio') ?? false;

    return MediaMetadataSchema.parse({
        codecName: videoStream.codec_name ?? '',
        durationMs:
            parseSecondsToMs(videoStream.duration) ||
            parseSecondsToMs(format?.duration),
        filePath,
        fps: parseFrameRate(videoStream.r_frame_rate),
        hasAudio,
        height: videoStream.height ?? 0,
        width: videoStream.width ?? 0
    });
};
