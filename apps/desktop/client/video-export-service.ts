
import { spawn } from 'node:child_process';
import { access, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { validateVideoProject } from '@wise-cut/video-project';

import type {
    VideoExportError,
    VideoExportOperationResult,
    VideoExportProgressEvent,
    VideoExportRenderInput,
    VideoExportSelectOutputPathInput
} from '../shared/video-export';

import { resolveVideoExportBinaries } from './video-export-binaries';
import {
    createVideoExportFfmpegCommand,
    resolveBundledMusicFilePath,
    resolveVideoExportDurationMs,
    writeVideoExportSubtitleSrt
} from './video-export-ffmpeg';

type VideoExportAppContext = {
    getAppPath: () => string;
    getPath: (name: 'downloads' | 'temp') => string;
    isPackaged: boolean;
};

type VideoExportDialog = {
    showSaveDialog: (options: {
        defaultPath: string;
        filters: {
            extensions: string[];
            name: string;
        }[];
        title: string;
    }) => Promise<{
        canceled: boolean;
        filePath?: string;
    }>;
};

type FfmpegProgressInput = {
    percent?: number;
    rawTimeMs?: number;
};

type RunFfmpeg = (input: {
    args: string[];
    durationMs: number;
    ffmpegPath: string;
    onProgress?: (progress: FfmpegProgressInput) => void;
}) => Promise<void>;

type VideoExportRendererDependencies = {
    app: VideoExportAppContext;
    dialog: VideoExportDialog;
    emitProgress?: (event: VideoExportProgressEvent) => void;
    platform?: typeof process.platform;
    resourcesPath?: string;
    runFfmpeg?: RunFfmpeg;
};

const createSafeFileName = (value: string) => {
    const safeName = [...value]
        .map((character) =>
            character.charCodeAt(0) < 32 || /[<>:"/\\|?*]/.test(character)
                ? '-'
                : character
        )
        .join('')
        .trim();

    return safeName || '导出';
};

const toFailure = (error: VideoExportError): VideoExportOperationResult => ({
    error,
    success: false
});

const parseFfmpegTimestampMs = (value: string) => {
    const match = value.match(/^(\d{2}):(\d{2}):(\d{2}(?:\.\d+)?)$/);

    if (!match) return undefined;

    const [, hours, minutes, seconds] = match;

    return Math.round(
        (Number(hours) * 3600 + Number(minutes) * 60 + Number(seconds)) * 1000
    );
};

const parseFfmpegProgressMs = (chunk: string) => {
    const outTimeUsMatch = chunk.match(/out_time_(?:us|ms)=(\d+)/);

    if (outTimeUsMatch) {
        return Math.round(Number(outTimeUsMatch[1]) / 1000);
    }

    const stderrTimeMatch = chunk.match(/time=(\d{2}:\d{2}:\d{2}(?:\.\d+)?)/);

    return stderrTimeMatch
        ? parseFfmpegTimestampMs(stderrTimeMatch[1])
        : undefined;
};

const clampProgressPercent = (percent: number) =>
    Math.min(100, Math.max(0, Math.round(percent)));

const defaultRunFfmpeg: RunFfmpeg = ({
    args,
    durationMs,
    ffmpegPath,
    onProgress
}) =>
    new Promise((resolve, reject) => {
        const child = spawn(ffmpegPath, args, {
            stdio: ['ignore', 'ignore', 'pipe']
        });
        const stderrChunks: Buffer[] = [];

        child.stderr.on('data', (chunk: Buffer) => {
            stderrChunks.push(chunk);
            const rawTimeMs = parseFfmpegProgressMs(chunk.toString('utf8'));

            if (typeof rawTimeMs !== 'number' || durationMs <= 0) return;

            onProgress?.({
                percent: clampProgressPercent((rawTimeMs / durationMs) * 100),
                rawTimeMs
            });
        });
        child.on('error', reject);
        child.on('close', (code) => {
            if (code === 0) {
                resolve();
                return;
            }

            reject(
                new Error(
                    Buffer.concat(stderrChunks).toString('utf8') ||
                        `FFmpeg exited with code ${code ?? 'unknown'}`
                )
            );
        });
    });

const ensureExecutableExists = async (filePath: string) => {
    await access(filePath);
};

const hasSubtitleClips = (input: VideoExportRenderInput) => {
    if (input.subtitleSettings?.isVisible === false) return false;

    return input.project.tracks.some(
        (track) => track.kind === 'subtitle' && track.clips.length > 0
    );
};

const resolveOutputPath = async ({
    app,
    dialog,
    input
}: {
    app: VideoExportAppContext;
    dialog: VideoExportDialog;
    input: VideoExportRenderInput;
}) => {
    if (input.outputPath) return input.outputPath;

    const result = await dialog.showSaveDialog({
        defaultPath: path.join(
            app.getPath('downloads'),
            `${createSafeFileName(input.project.project.title)}.mp4`
        ),
        filters: [
            {
                extensions: ['mp4'],
                name: 'MP4 Video'
            }
        ],
        title: '导出视频'
    });

    if (result.canceled || !result.filePath) return undefined;

    return result.filePath;
};

export const selectVideoExportOutputPath = async ({
    app,
    dialog,
    input
}: {
    app: VideoExportAppContext;
    dialog: VideoExportDialog;
    input: VideoExportSelectOutputPathInput;
}): Promise<VideoExportOperationResult> => {
    const result = await dialog.showSaveDialog({
        defaultPath: path.join(
            app.getPath('downloads'),
            `${createSafeFileName(input.projectTitle)}.mp4`
        ),
        filters: [
            {
                extensions: ['mp4'],
                name: 'MP4 Video'
            }
        ],
        title: '导出视频'
    });

    if (result.canceled || !result.filePath) {
        return toFailure({
            code: 'CANCELLED',
            message: '用户取消选择导出路径'
        });
    }

    return {
        data: {
            outputPath: result.filePath
        },
        success: true
    };
};

export const createVideoExportRenderer = ({
    app,
    dialog,
    emitProgress,
    platform = process.platform,
    resourcesPath = process.resourcesPath,
    runFfmpeg = defaultRunFfmpeg
}: VideoExportRendererDependencies) => {
    const emit = (event: VideoExportProgressEvent) => {
        emitProgress?.({
            ...event,
            percent: clampProgressPercent(event.percent)
        });
    };

    return async (
        input: VideoExportRenderInput
    ): Promise<VideoExportOperationResult> => {
        const validation = validateVideoProject(input.project);

        if (validation.success === false) {
            return toFailure({
                code: 'VALIDATION_FAILED',
                message: validation.issues.join('\n')
            });
        }

        const outputPath = await resolveOutputPath({
            app,
            dialog,
            input
        });

        if (!outputPath) {
            return toFailure({
                code: 'CANCELLED',
                message: '用户取消导出'
            });
        }

        let tempDirectory: string | undefined;

        try {
            emit({
                message: '正在准备导出资源',
                percent: 5,
                phase: 'preparing'
            });

            const binaries = resolveVideoExportBinaries({
                appPath: app.getAppPath(),
                isPackaged: app.isPackaged,
                platform,
                resourcesPath
            });

            await ensureExecutableExists(binaries.ffmpegPath);

            tempDirectory = await mkdtemp(
                path.join(app.getPath('temp') || tmpdir(), 'miaoma-export-')
            );

            const subtitleSrtPath = hasSubtitleClips(input)
                ? path.join(tempDirectory, 'subtitles.srt')
                : undefined;

            if (subtitleSrtPath) {
                await writeVideoExportSubtitleSrt({
                    outputPath: subtitleSrtPath,
                    project: input.project
                });
            }

            const bundledMusicPath =
                input.musicSettings?.enabled === false
                    ? undefined
                    : resolveBundledMusicFilePath({
                          appPath: app.getAppPath(),
                          isPackaged: app.isPackaged,
                          resourcesPath,
                          selectedTrackId:
                              input.musicSettings?.selectedTrackId ?? 'song_01'
                      });
            const command = createVideoExportFfmpegCommand({
                bundledMusicPath,
                ffmpegPath: binaries.ffmpegPath,
                musicSettings: input.musicSettings,
                outputPath,
                project: input.project,
                subtitleSettings: input.subtitleSettings,
                subtitleSrtPath
            });

            emit({
                message: '正在渲染视频',
                percent: 10,
                phase: 'rendering'
            });

            await runFfmpeg({
                args: command.args,
                durationMs: resolveVideoExportDurationMs(input.project),
                ffmpegPath: command.ffmpegPath,
                onProgress: (progress) => {
                    emit({
                        message: '正在渲染视频',
                        percent: Math.max(
                            10,
                            Math.min(99, progress.percent ?? 10)
                        ),
                        phase: 'rendering',
                        rawTimeMs: progress.rawTimeMs
                    });
                }
            });

            emit({
                message: '导出完成',
                percent: 100,
                phase: 'completed'
            });

            return {
                data: {
                    outputPath
                },
                success: true
            };
        } catch (error) {
            const failure = {
                code:
                    error instanceof Error &&
                    error.message.includes('Unsupported FFmpeg platform')
                        ? 'UNSUPPORTED_PLATFORM'
                        : 'FFMPEG_FAILED',
                message: error instanceof Error ? error.message : String(error)
            } satisfies VideoExportError;

            emit({
                message: failure.message,
                percent: 100,
                phase: 'failed'
            });

            return toFailure(failure);
        } finally {
            if (tempDirectory) {
                await rm(tempDirectory, {
                    force: true,
                    recursive: true
                });
            }
        }
    };
};
