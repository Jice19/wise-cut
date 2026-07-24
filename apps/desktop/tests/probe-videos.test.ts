/* */
import { execFile } from 'node:child_process';
import { accessSync } from 'node:fs';
import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

import { describe, expect, it } from 'vitest';

import { probeMedia } from '@wise-cut/video-agent';

const execFileAsync = promisify(execFile);

const SUPPORTED_VIDEO_EXTENSIONS = new Set([
    '.m4v',
    '.mov',
    '.mp4',
    '.webm'
]);

const resolveFfprobePath = (): string => {
    const candidates = [
        '/opt/homebrew/bin/ffprobe',
        '/usr/local/bin/ffprobe',
        '/usr/bin/ffprobe'
    ];
    for (const candidate of candidates) {
        try {
            accessSync(candidate);
            return candidate;
        } catch {
            // continue
        }
    }
    return 'ffprobe';
};

const FFMPEG_BIN = resolveFfprobePath();

const resolveDirectory = (): string => {
    const fromEnv = process.env.PROBE_VIDEOS_DIR;
    if (fromEnv) return path.resolve(fromEnv);

    return path.resolve(process.cwd(), '../videos');
};

const listVideoFiles = async (directory: string): Promise<string[]> => {
    const entries = await readdir(directory, { withFileTypes: true });
    return entries
        .filter((entry) => entry.isFile())
        .filter((entry) =>
            SUPPORTED_VIDEO_EXTENSIONS.has(
                path.extname(entry.name).toLowerCase()
            )
        )
        .sort((left, right) => left.name.localeCompare(right.name))
        .map((entry) => path.join(directory, entry.name));
};

const formatDuration = (durationMs: number) => {
    const seconds = durationMs / 1000;
    return `${seconds.toFixed(3)}s (${durationMs}ms)`;
};

describe('probe-videos (demo)', () => {
    it('prints real metadata for every video in the directory', async () => {
        const directory = resolveDirectory();

        try {
            await stat(directory);
        } catch (error) {
            const message =
                error instanceof Error ? error.message : String(error);
            throw new Error(`目录不存在：${directory} (${message})`);
        }

        const files = await listVideoFiles(directory);

        if (files.length === 0) {
            // eslint-disable-next-line no-console
            console.log(`[probe-videos] ${directory} 下没有视频文件`);
            return;
        }

        // 1. 直接调 ffprobe 当 ground truth
        // eslint-disable-next-line no-console
        console.log(
            `\n[probe-videos] ffprobe ground truth (${FFMPEG_BIN}):`
        );
        // eslint-disable-next-line no-console
        console.log(
            'file'.padEnd(48) +
                'duration'.padEnd(20) +
                'fps'.padEnd(8) +
                'resolution'.padEnd(14) +
                'frames'
        );
        // eslint-disable-next-line no-console
        console.log('-'.repeat(100));

        const groundTruth: Array<{
            file: string;
            durationMs: number;
            fps: number;
            width: number;
            height: number;
            nbFrames: number;
        }> = [];

        for (const file of files) {
            const { stdout } = await execFileAsync(FFMPEG_BIN, [
                '-v',
                'error',
                '-select_streams',
                'v:0',
                '-show_entries',
                'stream=duration,r_frame_rate,nb_frames,width,height',
                '-of',
                'default=noprint_wrappers=1',
                file
            ]);

            const fields = Object.fromEntries(
                stdout
                    .trim()
                    .split('\n')
                    .map((line) => {
                        const [key, value] = line.split('=');
                        return [key, value];
                    })
            );

            const [num, den] = (fields.r_frame_rate ?? '0/1').split('/');
            const fps = Number(num) / Math.max(1, Number(den));
            const durationMs = Math.round(
                Number(fields.duration ?? '0') * 1000
            );
            const width = Number(fields.width ?? '0');
            const height = Number(fields.height ?? '0');
            const nbFrames = Number(fields.nb_frames ?? '0');

            groundTruth.push({
                durationMs,
                file: path.basename(file),
                fps,
                height,
                nbFrames,
                width
            });

            // eslint-disable-next-line no-console
            console.log(
                path.basename(file).padEnd(48) +
                    formatDuration(durationMs).padEnd(20) +
                    String(fps.toFixed(2)).padEnd(8) +
                    `${width}x${height}`.padEnd(14) +
                    String(nbFrames)
            );
        }

        // 2. 调 probeMedia
        // eslint-disable-next-line no-console
        console.log(
            `\n[probe-videos] probeMedia() (来自 @wise-cut/video-agent):`
        );
        // eslint-disable-next-line no-console
        console.log(
            'file'.padEnd(48) +
                'duration'.padEnd(20) +
                'fps'.padEnd(8) +
                'resolution'
        );
        // eslint-disable-next-line no-console
        console.log('-'.repeat(90));

        for (const file of files) {
            const metadata = await probeMedia({
                ffprobePath: FFMPEG_BIN,
                filePath: file
            });

            // eslint-disable-next-line no-console
            console.log(
                path.basename(file).padEnd(48) +
                    formatDuration(metadata.durationMs).padEnd(20) +
                    String(metadata.fps).padEnd(8) +
                    `${metadata.width}x${metadata.height}`
            );
        }

        // 3. 跑一个 sanity assertion，确保 ground truth 和 probeMedia 一致
        for (const truth of groundTruth) {
            const metadata = await probeMedia({
                ffprobePath: FFMPEG_BIN,
                filePath: path.join(directory, truth.file)
            });

            // 允许 ±50ms 的 rounding 误差
            expect(
                Math.abs(metadata.durationMs - truth.durationMs)
            ).toBeLessThan(50);
            expect(metadata.width).toBe(truth.width);
            expect(metadata.height).toBe(truth.height);
            expect(Math.abs(metadata.fps - truth.fps)).toBeLessThan(0.1);
        }

        // 4. 走一遍生产代码路径：scanAssets → AssetAnalysis。
        // 这是 user 实际看到"5 秒视频 + 后半段图片"问题的入口，
        // 修复后这里返回的 durationMs 必须等于 ffprobe 的真实值，
        // 而不是 `5000 + (index % 5) * 1500` 的占位假数据。
        const { createDesktopVideoAgentTools } = await import(
            '../client/video-agent-tools'
        );
        const tools = createDesktopVideoAgentTools({
            ffprobePath: FFMPEG_BIN,
            store: {} as never
        });

        const assets = await tools.scanAssets({
            input: {
                prompt: 'probe',
                runId: 'run_demo_probe',
                sourceAssetDirectory: directory
            }
        });

        // eslint-disable-next-line no-console
        console.log(
            `\n[probe-videos] createDesktopVideoAgentTools().scanAssets():`
        );
        // eslint-disable-next-line no-console
        console.log(
            'file'.padEnd(48) +
                'duration'.padEnd(20) +
                'fps'.padEnd(8) +
                'resolution'
        );
        // eslint-disable-next-line no-console
        console.log('-'.repeat(90));

        for (let index = 0; index < assets.length; index += 1) {
            const asset = assets[index];
            if (!asset) continue;
            const truth = groundTruth[index];
            // eslint-disable-next-line no-console
            console.log(
                path.basename(files[index] ?? '').padEnd(48) +
                    formatDuration(asset.durationMs).padEnd(20) +
                    String(asset.fps ?? '?').padEnd(8) +
                    `${asset.width ?? '?'}x${asset.height ?? '?'}`
            );

            // 决定性断言：scanAssets 的 durationMs 必须等于 ffprobe 的真实值。
            // 修复前这里是 5000/6500/8000（占位），修复后是真实时长。
            if (truth) {
                expect(
                    Math.abs(asset.durationMs - truth.durationMs)
                ).toBeLessThan(50);
                expect(asset.width).toBe(truth.width);
                expect(asset.height).toBe(truth.height);
            }
        }
    }, 60_000);
});