/* */
import { execFile } from 'node:child_process';
import { mkdir, readdir } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export type ExtractedKeyframe = {
    index: number;
    path: string;
    timestampMs: number;
};

export type ExtractKeyframesInput = {
    durationMs: number;
    ffmpegPath: string;
    filePath: string;
    maxFrames?: number;
    outputDirectory: string;
    targetFps?: number;
};

/**
 * 把视频的时长映射成"目标帧数":5s 内 4 帧、5-15s 6 帧、更长按 6 + 秒数/30 上限 12。
 * 短视频不会过疏、长视频不会过密,关键帧密度跟时长正相关但收敛。
 */
export const computeFrameCount = (durationMs: number) => {
    if (durationMs <= 0) return 4;
    if (durationMs < 5_000) return 4;
    if (durationMs < 15_000) return 6;

    return Math.min(12, 6 + Math.floor(durationMs / 30_000));
};

/**
 * 根据目标帧数反推均匀抽帧的 fps。fps = frameCount / durationSeconds。
 * 不小于 1/30(避免一秒不到一帧),不大于 1(避免重复抽同一帧)。
 */
export const computeSamplingFps = ({
    durationMs,
    targetFrameCount
}: {
    durationMs: number;
    targetFrameCount: number;
}) => {
    const seconds = Math.max(durationMs / 1000, 1);

    return Math.min(1, Math.max(1 / 30, targetFrameCount / seconds));
};

/**
 * 抽帧主函数。一次性输出 320px 宽缩略图 jpg,文件名按 index 排序。
 * durationMs 由调用方传入(通常来自 ffprobe 结果)。
 * 返回的 timestampMs 按采样 fps 均匀分布。
 */
export const extractKeyframes = async ({
    durationMs,
    ffmpegPath,
    filePath,
    maxFrames,
    outputDirectory,
    targetFps
}: ExtractKeyframesInput): Promise<ExtractedKeyframe[]> => {
    const frameCount = Math.min(
        maxFrames ?? Number.POSITIVE_INFINITY,
        computeFrameCount(durationMs)
    );
    const samplingFps = targetFps ?? computeSamplingFps({
        durationMs,
        targetFrameCount: frameCount
    });

    await mkdir(outputDirectory, { recursive: true });

    await execFileAsync(ffmpegPath, [
        '-hide_banner',
        '-loglevel',
        'error',
        '-i',
        filePath,
        '-vf',
        `fps=${samplingFps},scale=320:-1`,
        '-frames:v',
        String(frameCount),
        '-q:v',
        '5',
        '-y',
        path.join(outputDirectory, 'frame-%02d.jpg')
    ]);

    const generatedFiles = (await readdir(outputDirectory))
        .filter((fileName) => fileName.startsWith('frame-'))
        .filter((fileName) => fileName.endsWith('.jpg'))
        .sort();

    return generatedFiles.map((fileName, index) => {
        const match = fileName.match(/frame-(\d+)\.jpg/);
        const parsedIndex = match ? Number(match[1]) - 1 : index;
        const timestampMs = Math.round((parsedIndex / samplingFps) * 1000);

        return {
            index: parsedIndex,
            path: path.join(outputDirectory, fileName),
            timestampMs: Math.min(timestampMs, durationMs)
        };
    });
};
