/**
 * 抽帧 —— 用 ffmpeg 均匀采样并解析 showinfo 拿真实时间戳。
 *
 * 对比 plan §2.2 关键修正:
 *   - 用 `-vf fps=1/<sampleIntervalSec>,showinfo` 均匀采样 + 把 pts_time 打到 stderr
 *   - promisify(execFile) success 分支不暴露 stderr,所以用 `2>&1` shell 重定向
 *   - 单帧 `width / height` 用 ffprobe -show_entries stream=width,height 拿一次
 *
 * 约束:
 *   - `sampleIntervalSec >= 1`(更密集采样会让 LLM 调用成本爆炸)
 *   - `maxFrames >= 1`
 *   - 输出目录不存在会自动创建
 */

import { execFile } from 'node:child_process';
import { mkdir, readdir } from 'node:fs/promises';
import path from 'node:path';

import { ExtractedKeyframeSchema } from '../../../video-project/src/index.ts';

/**
 * execFile 但保留 stderr —— promisify(execFile) 默认只截 stdout,ffmpeg 把 pts_time 打 stderr。
 * 走 callback 形式取到 stderr 再 resolve,避免用 shell `2>&1`(execFile 不走 shell)。
 */
const execFileWithStderr = (
    command: string,
    args: readonly string[]
): Promise<{ stderr: string; stdout: string }> =>
    new Promise((resolve, reject) => {
        execFile(
            command,
            [...args],
            { maxBuffer: 64 * 1024 * 1024 },
            (error, stdout, stderr) => {
                if (error) {
                    reject(error);
                } else {
                    resolve({ stderr, stdout });
                }
            }
        );
    });

export class ExtractKeyframesError extends Error {
    constructor(
        message: string,
        readonly options: { cause?: unknown } = {}
    ) {
        super(message);
        this.name = 'ExtractKeyframesError';
    }
}

/**
 * 抽帧参数。
 *
 * `maxFrames` 是软上限:实际抽帧数 = min(maxFrames, ceil(durationSec / sampleIntervalSec))。
 */
export const extractKeyframes = async ({
    ffmpegPath,
    filePath,
    maxFrames,
    outputDirectory,
    sampleIntervalSec
}: {
    ffmpegPath: string;
    filePath: string;
    maxFrames: number;
    outputDirectory: string;
    sampleIntervalSec: number;
}) => {
    if (maxFrames < 1) {
        throw new ExtractKeyframesError('maxFrames must be >= 1');
    }

    if (sampleIntervalSec < 1) {
        throw new ExtractKeyframesError('sampleIntervalSec must be >= 1');
    }

    await mkdir(outputDirectory, { recursive: true });

    const outputPattern = path.join(outputDirectory, 'frame-%03d.jpg');
    const ffprobePath = ffmpegPath.replace(/ffmpeg(?:\.exe)?$/, (m) =>
        m.endsWith('.exe') ? 'ffprobe.exe' : 'ffprobe'
    );

    // 单次 ffmpeg:showinfo 同时打 pts_time 到 stderr,通过 callback 形式拿到
    let stderrText: string;

    try {
        const result = await execFileWithStderr(ffmpegPath, [
            '-hide_banner',
            '-i',
            filePath,
            '-vf',
            `fps=1/${sampleIntervalSec},showinfo`,
            '-frames:v',
            String(maxFrames),
            '-q:v',
            '2',
            '-y',
            outputPattern
        ]);
        stderrText = result.stderr;
    } catch (error) {
        throw new ExtractKeyframesError(
            `ffmpeg extract failed for ${filePath}: ${(error as Error).message}`,
            { cause: error }
        );
    }

    const generatedFiles = (await readdir(outputDirectory))
        .filter((f) => f.startsWith('frame-') && f.endsWith('.jpg'))
        .sort();

    if (generatedFiles.length === 0) {
        return [];
    }

    const ptsRegex = /pts_time:([\d.]+)/g;
    const timestamps: number[] = [];
    let match: RegExpExecArray | null;

    while ((match = ptsRegex.exec(stderrText))) {
        timestamps.push(Math.round(Number(match[1]) * 1000));
    }

    // fallback:showinfo 没解析到(老版本 ffmpeg / 罕见 codec)时,按 sampleIntervalSec 均匀推断
    const effectiveTimestamps =
        timestamps.length >= generatedFiles.length
            ? timestamps.slice(0, generatedFiles.length)
            : generatedFiles.map((_, i) => i * sampleIntervalSec * 1000);

    // 单帧尺寸只跟视频流有关,抽一次就够
    const { width, height } = await readVideoDimensions(ffprobePath, filePath);

    return generatedFiles.map((fileName, index) =>
        ExtractedKeyframeSchema.parse({
            height,
            index: index + 1,
            path: path.join(outputDirectory, fileName),
            timestampMs:
                effectiveTimestamps[index] ?? index * sampleIntervalSec * 1000,
            width
        })
    );
};

const readVideoDimensions = async (
    ffprobePath: string,
    filePath: string
): Promise<{ height: number; width: number }> => {
    const { stdout } = await execFileWithStderr(ffprobePath, [
        '-v',
        'error',
        '-select_streams',
        'v:0',
        '-show_entries',
        'stream=width,height',
        '-of',
        'csv=p=0',
        filePath
    ]).then((r) => ({ stdout: r.stdout }));

    const [width = 0, height = 0] = stdout
        .trim()
        .split(',')
        .map((v) => Number(v));

    return { height, width };
};
