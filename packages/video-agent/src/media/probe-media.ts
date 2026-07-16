/* */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export type MediaMetadata = {
    codecName: string;
    durationMs: number;
    filePath: string;
    fps: number;
    height: number;
    width: number;
};

type FfprobeStream = {
    codec_name?: string;
    codec_type?: string;
    duration?: string;
    r_frame_rate?: string;
    width?: number;
    height?: number;
};

type FfprobeOutput = {
    format?: {
        duration?: string;
    };
    streams?: FfprobeStream[];
};

const parseSecondsToMs = (value: string | undefined) => {
    const seconds = Number(value);

    if (!Number.isFinite(seconds)) {
        return 0;
    }

    return Math.round(seconds * 1000);
};

const parseFrameRate = (value: string | undefined) => {
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

export const probeMedia = async ({
    ffprobePath,
    filePath
}: {
    ffprobePath: string;
    filePath: string;
}): Promise<MediaMetadata> => {
    const { stdout } = await execFileAsync(ffprobePath, [
        '-v',
        'error',
        '-print_format',
        'json',
        '-show_format',
        '-show_streams',
        filePath
    ]);
    const metadata = JSON.parse(stdout) as FfprobeOutput;
    const videoStream = metadata.streams?.find(
        (stream) => stream.codec_type === 'video'
    );

    if (!videoStream) {
        throw new Error(`No video stream found in ${filePath}`);
    }

    return {
        codecName: videoStream.codec_name ?? '',
        durationMs:
            parseSecondsToMs(videoStream.duration) ||
            parseSecondsToMs(metadata.format?.duration),
        filePath,
        fps: parseFrameRate(videoStream.r_frame_rate),
        height: videoStream.height ?? 0,
        width: videoStream.width ?? 0
    };
};
