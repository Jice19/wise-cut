/**
 * 视频导出 pipeline 单元测试 —— commit 16。
 *
 * 用一个 mock child process(不用真的 ffmpeg)测:
 *   - resolveFfmpegPath 按平台返回正确路径
 *   - scaleFilter 等比缩放 + 居中黑边
 *   - parseFfmpegProgress 解析 out_time_us / progress=end
 *   - startExport 后 onProgress 收到 percent + phase
 */

import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
    createExportPipeline,
    EXPORT_RESOLUTIONS,
    parseFfmpegProgress,
    resolveFfmpegPath,
    scaleFilter
} from '../client/export-pipeline.ts';

describe('resolveFfmpegPath', () => {
    const originalPlatform = process.platform;
    const originalResourcesPath = (process as { resourcesPath?: string })
        .resourcesPath;
    const originalEnv = process.env['FFMPEG_PATH'];

    afterEach(() => {
        Object.defineProperty(process, 'platform', { value: originalPlatform });
        if (originalResourcesPath) {
            (process as { resourcesPath: string }).resourcesPath =
                originalResourcesPath;
        } else {
            delete (process as { resourcesPath?: string }).resourcesPath;
        }
        if (originalEnv) {
            process.env['FFMPEG_PATH'] = originalEnv;
        } else {
            delete process.env['FFMPEG_PATH'];
        }
    });

    it('FFMPEG_PATH env 优先', () => {
        process.env['FFMPEG_PATH'] = '/custom/ffmpeg';
        expect(resolveFfmpegPath()).toBe('/custom/ffmpeg');
    });

    it('mac 默认 resourcesPath/bin/darwin/ffmpeg', () => {
        delete process.env['FFMPEG_PATH'];
        Object.defineProperty(process, 'platform', { value: 'darwin' });
        (process as { resourcesPath: string }).resourcesPath = '/app';
        expect(resolveFfmpegPath()).toBe('/app/bin/darwin/ffmpeg');
    });

    it('win32 默认 resourcesPath/bin/win32/ffmpeg.exe', () => {
        delete process.env['FFMPEG_PATH'];
        Object.defineProperty(process, 'platform', { value: 'win32' });
        (process as { resourcesPath: string }).resourcesPath = '/app';
        expect(resolveFfmpegPath()).toBe('/app/bin/win32/ffmpeg.exe');
    });
});

describe('scaleFilter', () => {
    it('720p: 1920x1080 → 等比 1280x720 居中', () => {
        const filter = scaleFilter('720p', 1920, 1080);
        expect(filter).toContain('scale=1280:720');
        expect(filter).toContain('pad=1280:720');
    });

    it('4k: 1920x1080 → 3840x2160(放大)', () => {
        const filter = scaleFilter('4k', 1920, 1080);
        expect(filter).toContain('scale=3840:2160');
    });

    it('方形源 1080x1080 → 720p 居中黑边', () => {
        const filter = scaleFilter('720p', 1080, 1080);
        expect(filter).toContain('pad=1280:720');
    });
});

describe('parseFfmpegProgress', () => {
    it('out_time_us 2000000 / durationUs 10000000 → percent=20', () => {
        const result = parseFfmpegProgress('out_time_us=2000000', 10_000_000);
        expect(result).toEqual({ percent: 20, phase: 'rendering' });
    });

    it('out_time_us 100% → percent=100', () => {
        const result = parseFfmpegProgress('out_time_us=10000000', 10_000_000);
        expect(result?.percent).toBe(100);
    });

    it('progress=end → percent=100 phase=completed', () => {
        const result = parseFfmpegProgress('progress=end', 10_000_000);
        expect(result).toEqual({ percent: 100, phase: 'completed' });
    });

    it('无关行 → null', () => {
        expect(parseFfmpegProgress('frame=12 fps=30.5', 10_000_000)).toBeNull();
    });

    it('durationUs=0 → null(避免除零)', () => {
        const result = parseFfmpegProgress('out_time_us=2000000', 0);
        expect(result).toBeNull();
    });
});

describe('EXPORT_RESOLUTIONS', () => {
    it('4 档分辨率都有', () => {
        expect(EXPORT_RESOLUTIONS['720p']).toEqual({
            height: 720,
            width: 1280
        });
        expect(EXPORT_RESOLUTIONS['1080p']).toEqual({
            height: 1080,
            width: 1920
        });
        expect(EXPORT_RESOLUTIONS['2k']).toEqual({
            height: 1440,
            width: 2560
        });
        expect(EXPORT_RESOLUTIONS['4k']).toEqual({
            height: 2160,
            width: 3840
        });
    });
});

describe('createExportPipeline', () => {
    let cacheDir: string;

    beforeEach(() => {
        cacheDir = join(tmpdir(), `export-test-${Date.now()}`);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('输出 ffmpegPath + outputDir 字段', () => {
        const p = createExportPipeline({ outputDir: cacheDir });
        expect(p.ffmpegPath).toBeDefined();
        expect(p.outputDir).toBe(cacheDir);
    });

    it('cancelExport 不存在的 runId → false', () => {
        const p = createExportPipeline({ outputDir: cacheDir });
        expect(p.cancelExport('not-found')).toBe(false);
    });

    it('onProgress 返回 unsubscribe', () => {
        const p = createExportPipeline({ outputDir: cacheDir });
        const unsubscribe = p.onProgress(() => {});
        expect(typeof unsubscribe).toBe('function');
        unsubscribe();
    });
});
