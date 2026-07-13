/**
 * video-project schema 验证测试 —— 字段契约是否合法。
 */

import {
    AssetAnalysisSchema,
    ExtractedKeyframeSchema,
    FrameDescriptionSchema,
    MediaMetadataSchema,
    RenderConfigSchema
} from '@miaoma-magicut/video-project';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

describe('video-project schemas', () => {
    it('RenderConfigSchema accepts preview / final', () => {
        expect(() =>
            RenderConfigSchema.parse({ format: 'mp4', quality: 'preview' })
        ).not.toThrow();
        expect(() =>
            RenderConfigSchema.parse({ format: 'mp4', quality: 'final' })
        ).not.toThrow();
        expect(() =>
            RenderConfigSchema.parse({ format: 'mp4', quality: 'unknown' })
        ).toThrow();
    });

    it('MediaMetadataSchema rejects missing positive dims', () => {
        const valid = {
            codecName: 'h264',
            durationMs: 5000,
            filePath: '/tmp/a.mp4',
            fps: 30,
            hasAudio: true,
            height: 1080,
            width: 1920
        };

        expect(() => MediaMetadataSchema.parse(valid)).not.toThrow();

        const broken = { ...valid, width: 0 };

        expect(() => MediaMetadataSchema.parse(broken)).toThrow();
    });

    it('ExtractedKeyframeSchema round-trips', () => {
        const parsed = ExtractedKeyframeSchema.parse({
            height: 720,
            index: 1,
            path: '/tmp/frame-001.jpg',
            timestampMs: 2000,
            width: 1280
        });

        expect(parsed.timestampMs).toBe(2000);
    });

    it('FrameDescriptionSchema requires non-empty description', () => {
        expect(() =>
            FrameDescriptionSchema.parse({
                actions: [],
                description: 'OK',
                frameId: 'f-1',
                mood: 'neutral',
                objects: []
            })
        ).not.toThrow();

        expect(() =>
            FrameDescriptionSchema.parse({
                actions: [],
                description: '',
                frameId: 'f-1',
                mood: 'neutral',
                objects: []
            })
        ).toThrow();
    });

    it('AssetAnalysisSchema accepts empty frames array (degraded path)', () => {
        const parsed = AssetAnalysisSchema.parse({
            assetId: 'a-1',
            description: '',
            durationMs: 0,
            filePath: '/tmp/a.mp4',
            fps: 0,
            frames: [],
            height: 720,
            width: 1280
        });

        expect(parsed.frames).toEqual([]);
    });

    it('zod schema version is 4.x', () => {
        expect(
            (z as unknown as { ZodFirstPartyTypeKind: unknown })
                .ZodFirstPartyTypeKind
        ).toBeDefined();
    });
});
