/**
 * analyzeAssets 单元测试 —— 真实跑 ffmpeg/ffprobe,mock modelProvider。
 *
 * 关键断言(对应 plan §2.5):
 *   - durationMs / width / height / fps 真实测量(不是硬编码 5000+1500*N)
 *   - frames 数组非空,每项有真实 timestampMs(>= 0)+ 中文 description
 *   - audio-only 文件降级为 frames: []
 *   - modelProvider 报错时也降级,不抛错
 */

import { execFile } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
    analyzeAssets,
    createFsVideoAgentTools
} from '../src/graph/steps/analyze-assets.ts';
import type { ModelProvider } from '../src/providers/model-provider.ts';

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

const stubModel = (responses: Record<string, string>): ModelProvider => ({
    async describeFrames({ frames }) {
        return frames.map((f) => {
            const description =
                responses[f.frameId] ?? `auto-desc for ${f.frameId}`;
            return {
                actions: ['standing'],
                description,
                frameId: f.frameId,
                mood: '平静',
                objects: ['人']
            };
        });
    },
    // commit 15 stub:跑帧分组分析时报 no LLM key
    async generateText() {
        throw new Error('no LLM key');
    }
});

describe.skipIf(!hasFfmpeg)('analyzeAssets', () => {
    let workDir: string;
    let videoPath: string;
    let audioPath: string;
    let framesDir: string;

    beforeAll(async () => {
        workDir = await mkdtemp(join(tmpdir(), 'analyze-assets-test-'));
        videoPath = join(workDir, 'sample.mp4');
        audioPath = join(workDir, 'audio-only.mp3');
        framesDir = join(workDir, 'frames');

        await execFileAsync(FFMPEG, [
            '-y',
            '-f',
            'lavfi',
            '-i',
            'testsrc=duration=10:size=320x240:rate=30',
            '-pix_fmt',
            'yuv420p',
            videoPath
        ]);

        await execFileAsync(FFMPEG, [
            '-y',
            '-f',
            'lavfi',
            '-i',
            'sine=frequency=440:duration=3',
            audioPath
        ]);
    }, 30_000);

    afterAll(async () => {
        await rm(workDir, { recursive: true, force: true });
    });

    it('analyzes a real video with metadata + frames + descriptions', async () => {
        const tools = createFsVideoAgentTools();
        const model = stubModel({
            'asset-1-1': '测试源画面,显示彩色条纹',
            'asset-1-2': '画面持续,条纹滚动',
            'asset-1-3': '画面继续,色调变化',
            'asset-1-4': '画面接近结尾',
            'asset-1-5': '画面结尾'
        });

        const result = await analyzeAssets({
            assets: [{ assetId: 'asset-1', filePath: videoPath }],
            ffmpegPath: FFMPEG,
            ffprobePath: FFPROBE,
            frameOutputDirectory: framesDir,
            modelProvider: model,
            tools
        });

        expect(result).toHaveLength(1);
        const a = result[0]!;
        expect(a.assetId).toBe('asset-1');
        expect(a.durationMs).toBeGreaterThanOrEqual(9_000);
        expect(a.durationMs).toBeLessThanOrEqual(11_000);
        expect(a.width).toBe(320);
        expect(a.height).toBe(240);
        expect(a.fps).toBeGreaterThan(0);
        expect(a.frames.length).toBeGreaterThan(0);
        expect(a.frames[0]!.description).toContain('测试源画面');
        // 真实 timestampMs(不再写死 0)
        expect(a.frames.some((f) => f.timestampMs > 0)).toBe(true);
        // description 取自首帧
        expect(a.description).toBe(a.frames[0]!.description);
    });

    it('degrades audio-only file to empty frames', async () => {
        const tools = createFsVideoAgentTools();
        const model = stubModel({});

        const result = await analyzeAssets({
            assets: [{ assetId: 'audio-1', filePath: audioPath }],
            ffmpegPath: FFMPEG,
            ffprobePath: FFPROBE,
            frameOutputDirectory: join(workDir, 'frames-audio'),
            modelProvider: model,
            tools
        });

        expect(result).toHaveLength(1);
        expect(result[0]!.frames).toEqual([]);
        expect(result[0]!.durationMs).toBe(0);
    });

    it('degrades gracefully when model provider throws', async () => {
        const tools = createFsVideoAgentTools();
        const failingModel: ModelProvider = {
            async describeFrames() {
                throw new Error('mock M3 failure');
            },
            async generateText() {
                throw new Error('no LLM key');
            }
        };

        const result = await analyzeAssets({
            assets: [{ assetId: 'asset-2', filePath: videoPath }],
            ffmpegPath: FFMPEG,
            ffprobePath: FFPROBE,
            frameOutputDirectory: join(workDir, 'frames-fail'),
            modelProvider: failingModel,
            tools
        });

        expect(result).toHaveLength(1);
        expect(result[0]!.frames).toEqual([]);
    });

    it('handles mixed batch (video + audio) without throwing', async () => {
        const tools = createFsVideoAgentTools();
        const model = stubModel({
            'asset-mix-1': 'a frame',
            'asset-mix-2': 'b frame'
        });

        const result = await analyzeAssets({
            assets: [
                { assetId: 'asset-mix-1', filePath: videoPath },
                { assetId: 'asset-mix-2', filePath: audioPath }
            ],
            ffmpegPath: FFMPEG,
            ffprobePath: FFPROBE,
            frameOutputDirectory: join(workDir, 'frames-mix'),
            modelProvider: model,
            tools
        });

        expect(result).toHaveLength(2);
        expect(result[0]!.frames.length).toBeGreaterThan(0);
        expect(result[1]!.frames).toEqual([]);
    });
});
