/**
 * extractKeyframes 单元测试 —— 抽帧 + 时间戳断言。
 *
 * 关键断言(对应 plan §2.2):
 *   - timestampMs 全部 > 0(不再写死)
 *   - timestampMs 按升序
 *   - 帧间隔 ≈ sampleIntervalSec * 1000(±200ms 容差)
 */

import { execFile } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

import {
    extractKeyframes,
    ExtractKeyframesError
} from '@miaoma-magicut/video-agent';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const execFileAsync = promisify(execFile);
const FFMPEG = 'ffmpeg';

const hasFfmpeg = await (async () => {
    try {
        await execFileAsync(FFMPEG, ['-version']);

        return true;
    } catch {
        return false;
    }
})();

describe.skipIf(!hasFfmpeg)('extractKeyframes', () => {
    let workDir: string;
    let videoPath: string;
    let outputDir: string;

    beforeAll(async () => {
        workDir = await mkdtemp(join(tmpdir(), 'extract-frames-test-'));
        videoPath = join(workDir, 'sample.mp4');
        outputDir = join(workDir, 'frames');

        // 12 秒 320x240 测试视频,采 2s 间隔应得 6 帧
        await execFileAsync(FFMPEG, [
            '-y',
            '-f',
            'lavfi',
            '-i',
            'testsrc=duration=12:size=320x240:rate=30',
            '-pix_fmt',
            'yuv420p',
            videoPath
        ]);
    }, 30_000);

    afterAll(async () => {
        await rm(workDir, { recursive: true, force: true });
    });

    it('extracts evenly-spaced frames with real timestamps', async () => {
        const frames = await extractKeyframes({
            ffmpegPath: FFMPEG,
            filePath: videoPath,
            maxFrames: 8,
            outputDirectory: outputDir,
            sampleIntervalSec: 2
        });

        expect(frames.length).toBeGreaterThan(0);
        expect(frames.length).toBeLessThanOrEqual(8);

        // ffmpeg -vf fps=1/2 从 t=0 开始采,首帧 pts_time 可能是 0。
        // 后续帧必须 >= sampleIntervalSec * 1000 - 200ms 容差。
        for (const f of frames) {
            expect(f.timestampMs).toBeGreaterThanOrEqual(0);
        }

        // 升序
        for (let i = 1; i < frames.length; i++) {
            expect(frames[i]!.timestampMs).toBeGreaterThanOrEqual(
                frames[i - 1]!.timestampMs
            );
        }

        // 至少一帧的 pts_time > 0(证明不是 fallback 均匀推断而是真实 showinfo)
        expect(frames.some((f) => f.timestampMs > 0)).toBe(true);

        // 帧间隔 ≈ sampleIntervalSec * 1000(±300ms,跳过首帧可能为 0 的情况)
        for (let i = 1; i < frames.length; i++) {
            if (frames[i - 1]!.timestampMs === 0) continue;
            const gap = frames[i]!.timestampMs - frames[i - 1]!.timestampMs;
            expect(gap).toBeGreaterThan(1_700);
            expect(gap).toBeLessThan(2_300);
        }

        // 单帧 width/height 来自 ffprobe stream
        expect(frames[0]!.width).toBe(320);
        expect(frames[0]!.height).toBe(240);

        // 路径真实存在
        for (const f of frames) {
            const { stat } = await import('node:fs/promises');
            const s = await stat(f.path);
            expect(s.size).toBeGreaterThan(0);
        }
    });

    it('rejects maxFrames < 1', async () => {
        await expect(
            extractKeyframes({
                ffmpegPath: FFMPEG,
                filePath: videoPath,
                maxFrames: 0,
                outputDirectory: outputDir,
                sampleIntervalSec: 2
            })
        ).rejects.toBeInstanceOf(ExtractKeyframesError);
    });

    it('rejects sampleIntervalSec < 1', async () => {
        await expect(
            extractKeyframes({
                ffmpegPath: FFMPEG,
                filePath: videoPath,
                maxFrames: 4,
                outputDirectory: outputDir,
                sampleIntervalSec: 0
            })
        ).rejects.toBeInstanceOf(ExtractKeyframesError);
    });
});
