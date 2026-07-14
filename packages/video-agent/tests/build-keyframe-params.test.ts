/**
 * buildKeyframeParams 单元测试 —— commit 11 抽帧策略。
 *
 * 验证规则:
 *   - duration < 10s → sampleIntervalSec=1
 *   - duration >= 10s → sampleIntervalSec=2
 *   - maxFrames = min(20, max(1, ceil(duration / sampleInterval)))
 *
 * 例:
 *   5s   → { sampleIntervalSec: 1, maxFrames: 5 }
 *   10s  → { sampleIntervalSec: 2, maxFrames: 5 }
 *   30s  → { sampleIntervalSec: 2, maxFrames: 15 }
 *   60s  → { sampleIntervalSec: 2, maxFrames: 20 }
 *   120s → { sampleIntervalSec: 2, maxFrames: 20 } (cap)
 *   0s   → { sampleIntervalSec: 1, maxFrames: 1 }
 *   负数 → { sampleIntervalSec: 1, maxFrames: 1 } (clamp)
 */

import { describe, expect, it } from 'vitest';

import { buildKeyframeParams } from '../src/media/extract-keyframes.ts';

describe('buildKeyframeParams', () => {
    it('5s 视频 → 1s/帧 抽 5 帧', () => {
        const params = buildKeyframeParams(5);
        expect(params).toEqual({ maxFrames: 5, sampleIntervalSec: 1 });
    });

    it('9s 视频 → 1s/帧 抽 9 帧', () => {
        const params = buildKeyframeParams(9);
        expect(params).toEqual({ maxFrames: 9, sampleIntervalSec: 1 });
    });

    it('10s 视频 → 2s/帧 抽 5 帧(临界)', () => {
        const params = buildKeyframeParams(10);
        expect(params).toEqual({ maxFrames: 5, sampleIntervalSec: 2 });
    });

    it('30s 视频 → 2s/帧 抽 15 帧', () => {
        const params = buildKeyframeParams(30);
        expect(params).toEqual({ maxFrames: 15, sampleIntervalSec: 2 });
    });

    it('60s 视频 → 2s/帧 上限 20 帧', () => {
        const params = buildKeyframeParams(60);
        expect(params).toEqual({ maxFrames: 20, sampleIntervalSec: 2 });
    });

    it('120s 长视频 → 2s/帧 cap 在 20 帧', () => {
        const params = buildKeyframeParams(120);
        expect(params.maxFrames).toBe(20);
        expect(params.sampleIntervalSec).toBe(2);
    });

    it('0s 视频 → 默认 1 帧', () => {
        const params = buildKeyframeParams(0);
        expect(params).toEqual({ maxFrames: 1, sampleIntervalSec: 1 });
    });

    it('负数 → clamp 到 0', () => {
        const params = buildKeyframeParams(-5);
        expect(params).toEqual({ maxFrames: 1, sampleIntervalSec: 1 });
    });

    it('3.5s 视频 → 1s/帧 抽 4 帧(向上取整)', () => {
        const params = buildKeyframeParams(3.5);
        expect(params.sampleIntervalSec).toBe(1);
        expect(params.maxFrames).toBe(4);
    });

    it('11s 视频 → 2s/帧 抽 6 帧', () => {
        const params = buildKeyframeParams(11);
        expect(params).toEqual({ maxFrames: 6, sampleIntervalSec: 2 });
    });
});
