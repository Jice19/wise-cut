/* */
import { execFile } from 'node:child_process';
import { mkdtemp, readdir, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { extractKeyframes } from '../src/media/extract-keyframes';
import { probeMedia } from '../src/media/probe-media';

const execFileAsync = promisify(execFile);

const ffmpegPath = process.env.FFMPEG_PATH ?? 'ffmpeg';
const ffprobePath = process.env.FFPROBE_PATH ?? 'ffprobe';

const createFixtureVideo = async ({ filePath }: { filePath: string }) => {
    await execFileAsync(ffmpegPath, [
        '-hide_banner',
        '-loglevel',
        'error',
        '-f',
        'lavfi',
        '-i',
        'testsrc=size=160x90:rate=24',
        '-t',
        '1',
        '-pix_fmt',
        'yuv420p',
        '-y',
        filePath
    ]);
};

describe('media scan tools', () => {
    let tempDirectory: string;
    let videoPath: string;

    beforeEach(async () => {
        tempDirectory = await mkdtemp(path.join(tmpdir(), 'app-media-'));
        videoPath = path.join(tempDirectory, 'fixture.mp4');
        await createFixtureVideo({ filePath: videoPath });
    });

    afterEach(async () => {
        await rm(tempDirectory, { force: true, recursive: true });
    });

    it('probes video duration, dimensions, frame rate, and codec', async () => {
        const metadata = await probeMedia({
            ffprobePath,
            filePath: videoPath
        });

        expect(metadata.filePath).toBe(videoPath);
        expect(metadata.durationMs).toBeGreaterThanOrEqual(900);
        expect(metadata.durationMs).toBeLessThanOrEqual(1200);
        expect(metadata.width).toBe(160);
        expect(metadata.height).toBe(90);
        expect(metadata.fps).toBe(24);
        expect(metadata.codecName.length).toBeGreaterThan(0);
    });

    it('extracts keyframe image files into the output directory', async () => {
        const outputDirectory = path.join(tempDirectory, 'keyframes');

        // 用 4 帧让 sampling fps 至少 1,避免 mjpeg 编码器在 fps<1 时报
        // "Non full-range YUV is non-standard"。
        const keyframes = await extractKeyframes({
            durationMs: 1_000,
            ffmpegPath,
            filePath: videoPath,
            maxFrames: 4,
            outputDirectory,
            targetFps: 2
        });

        expect(keyframes.length).toBeGreaterThan(0);
        expect(keyframes[0]?.index).toBe(0);
        expect(keyframes[0]?.path.endsWith('.jpg')).toBe(true);

        const imageStats = await stat(keyframes[0]!.path);
        expect(imageStats.size).toBeGreaterThan(0);

        const generatedFiles = await readdir(outputDirectory);
        expect(generatedFiles[0]).toMatch(/^frame-\d+\.jpg$/);
    });
});
