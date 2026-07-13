/**
 * probeMedia 单元测试 —— 用 ffmpeg 自生成 5s 720p 测试 mp4,断言 metadata 字段。
 *
 * 跳过条件:本机没有 ffmpeg/ffmpeg 时整文件 skip,CI 可独立 gating。
 */

import { execFile } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

import { NoVideoStreamError, probeMedia } from '@miaoma-magicut/video-agent';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const execFileAsync = promisify(execFile);
const FFMPEG = 'ffmpeg';
const FFPROBE = 'ffprobe';

const hasFfmpeg = await (async () => {
    try {
        await execFileAsync(FFMPEG, ['-version']);
        await execFileAsync(FFPROBE, ['-version']);

        return true;
    } catch {
        return false;
    }
})();

describe.skipIf(!hasFfmpeg)('probeMedia', () => {
    let workDir: string;
    let videoPath: string;
    let audioOnlyPath: string;

    beforeAll(async () => {
        workDir = await mkdtemp(join(tmpdir(), 'probe-media-test-'));

        videoPath = join(workDir, 'sample.mp4');
        // 5 秒 320x240 测试视频
        await execFileAsync(FFMPEG, [
            '-y',
            '-f',
            'lavfi',
            '-i',
            'testsrc=duration=5:size=320x240:rate=30',
            '-pix_fmt',
            'yuv420p',
            videoPath
        ]);

        audioOnlyPath = join(workDir, 'audio-only.mp3');
        // 纯音频 3 秒
        await execFileAsync(FFMPEG, [
            '-y',
            '-f',
            'lavfi',
            '-i',
            'sine=frequency=440:duration=3',
            audioOnlyPath
        ]);
    }, 30_000);

    afterAll(async () => {
        await rm(workDir, { recursive: true, force: true });
    });

    it('returns MediaMetadata with real width / height / fps / durationMs', async () => {
        const metadata = await probeMedia({
            ffprobePath: FFPROBE,
            filePath: videoPath
        });

        expect(metadata.filePath).toBe(videoPath);
        expect(metadata.width).toBe(320);
        expect(metadata.height).toBe(240);
        expect(metadata.fps).toBeGreaterThan(0);
        expect(metadata.durationMs).toBeGreaterThanOrEqual(4_500);
        expect(metadata.durationMs).toBeLessThanOrEqual(5_500);
        expect(metadata.codecName).toBeTruthy();
        expect(metadata.hasAudio).toBe(false);
    });

    it('throws NoVideoStreamError for audio-only files', async () => {
        await expect(
            probeMedia({ ffprobePath: FFPROBE, filePath: audioOnlyPath })
        ).rejects.toBeInstanceOf(NoVideoStreamError);
    });

    it('throws on non-existent file', async () => {
        await expect(
            probeMedia({
                ffprobePath: FFPROBE,
                filePath: join(workDir, 'does-not-exist.mp4')
            })
        ).rejects.toThrow(/ffprobe failed|No video stream/);
    });
});
