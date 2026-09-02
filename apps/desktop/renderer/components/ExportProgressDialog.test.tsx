/* */
import { describe, expect, it } from 'vitest';

import { computeEstimatedRemainingMs } from './ExportProgressDialog';

describe('computeEstimatedRemainingMs', () => {
    it('estimates remaining time from elapsed and percent', () => {
        // 已用 10s、完成 50% → 剩余约 10s
        const remaining = computeEstimatedRemainingMs({
            elapsedMs: 10_000,
            percent: 50
        });

        expect(remaining).toBeCloseTo(10_000, 0);
    });

    it('returns undefined-ish raw value for the first sample (no previous ETA)', () => {
        // 已用 2s、完成 10% → 剩余 18s,首样本直接采用原始值
        const remaining = computeEstimatedRemainingMs({
            elapsedMs: 2_000,
            percent: 10
        });

        expect(remaining).toBeCloseTo(18_000, 0);
    });

    it('smooths with EMA once previousEtaMs exists and enough time elapsed', () => {
        const raw = computeEstimatedRemainingMs({
            elapsedMs: 10_000,
            percent: 50
        })!; // 10000
        const next = computeEstimatedRemainingMs({
            elapsedMs: 11_000,
            percent: 55,
            previousEtaMs: raw
        })!; // raw = 11000*45/55 = 9000
        const expected = raw * 0.7 + 9_000 * 0.3;

        expect(next).toBeCloseTo(expected, 0);
        // EMA 应落在 raw 与上次之间(平滑,不跳变)
        expect(next).toBeLessThan(raw);
        expect(next).toBeGreaterThan(9_000);
    });

    it('keeps the previous estimate while percent is stalled or finished', () => {
        const stalled = computeEstimatedRemainingMs({
            elapsedMs: 20_000,
            percent: 0,
            previousEtaMs: 30_000
        });

        expect(stalled).toBe(30_000);

        const finished = computeEstimatedRemainingMs({
            elapsedMs: 20_000,
            percent: 100,
            previousEtaMs: 30_000
        });

        expect(finished).toBe(30_000);
    });
});
