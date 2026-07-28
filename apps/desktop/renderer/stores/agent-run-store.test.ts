/* */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { DesktopAgentRunEvent } from '../../shared/video-agent';

import { getAgentRunSnapshot } from './agent-run-store';

const installMockWindow = () => {
    const api = {
        videoAgent: {
            // 这些方法在 store 订阅 onEvent 之后才会用到,
            // snapshot 测试里不调 start/approve,所以 no-op 即可
            onEvent: () => () => {
                // 返回 unsubscribe
            },
            start: async () => ({
                success: false as const,
                error: { code: 'X' as const, message: 'x' }
            }),
            approve: async () => ({
                success: false as const,
                error: { code: 'X' as const, message: 'x' }
            }),
            cancel: async () => ({
                success: false as const,
                error: { code: 'X' as const, message: 'x' }
            }),
            reportSelectedFrames: async () => ({
                success: false as const,
                error: { code: 'X' as const, message: 'x' }
            }),
            analyzeAsset: async () => ({
                success: false as const,
                error: { code: 'X' as const, message: 'x' }
            })
        },
        videoProject: {
            list: async () => ({
                success: true as const,
                data: [] as Array<{ filePath: string; project: unknown }>
            })
        }
    };

    vi.stubGlobal('window', { miaomaAPI: api });

    return { api };
};

// type: 完整 discriminated union 的字面量(不能是 string)
const makeEvent = (
    runId: string,
    sequence: number,
    type: 'node.started' | 'node.completed'
): DesktopAgentRunEvent => ({
    createdAt: new Date().toISOString(),
    nodeName: 'scan_assets',
    runId,
    sequence,
    type
});

describe('agent run snapshot caching', () => {
    beforeEach(() => {
        installMockWindow();
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('returns the same snapshot reference when data has not changed', async () => {
        const { addAgentRunEvent, startAgentRun } = await import(
            './agent-run-store'
        );

        // startAgentRun 会 subscribe onEvent,触发一次 setEvents → notify → version 变化
        await startAgentRun({
            prompt: 'p',
            selectedVoice: 'v',
            sourceAssetDirectory: '/tmp'
        });

        // 这次 addAgentRunEvent 也会触发 version 变化
        addAgentRunEvent(makeEvent('run_001', 1, 'node.started'));

        // 第一次拿 snapshot(触发 cache fill)
        const snap1 = getAgentRunSnapshot('run_001');
        // 第二次:version 没变 → cache hit → 应该返回同一个引用
        const snap2 = getAgentRunSnapshot('run_001');

        expect(snap2).toBe(snap1);
    });

    it('returns a new snapshot when a new event arrives', async () => {
        const { addAgentRunEvent, startAgentRun } = await import(
            './agent-run-store'
        );

        await startAgentRun({
            prompt: 'p',
            selectedVoice: 'v',
            sourceAssetDirectory: '/tmp'
        });

        addAgentRunEvent(makeEvent('run_001', 1, 'node.started'));
        const before = getAgentRunSnapshot('run_001');

        addAgentRunEvent(makeEvent('run_001', 2, 'node.completed'));
        const after = getAgentRunSnapshot('run_001');

        expect(after).not.toBe(before);
        expect(after.events.length).toBeGreaterThan(before.events.length);
    });

    it('different runIds have independent snapshot caches', async () => {
        const { addAgentRunEvent, startAgentRun } = await import(
            './agent-run-store'
        );

        await startAgentRun({
            prompt: 'p',
            selectedVoice: 'v',
            sourceAssetDirectory: '/tmp'
        });
        addAgentRunEvent(makeEvent('run_A', 1, 'node.started'));
        addAgentRunEvent(makeEvent('run_B', 1, 'node.started'));

        const snapA = getAgentRunSnapshot('run_A');
        const snapB = getAgentRunSnapshot('run_B');

        expect(snapA.activeRunId).toBe('run_A');
        expect(snapB.activeRunId).toBe('run_B');
    });
});

describe('agent run FIFO cap', () => {
    beforeEach(() => {
        installMockWindow();
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('drops the oldest run when exceeding the cap', async () => {
        const { addAgentRunEvent } = await import('./agent-run-store');

        // 灌入 25 个 run,cap 是 20
        for (let i = 0; i < 25; i += 1) {
            const runId = `run_${String(i).padStart(3, '0')}`;
            addAgentRunEvent(makeEvent(runId, 1, 'node.started'));
        }

        // 现在 eventsByRunId 应该只剩 20 个,且最老的 5 个被淘汰
        const snap000 = getAgentRunSnapshot('run_000');
        const snap019 = getAgentRunSnapshot('run_019');
        const snap024 = getAgentRunSnapshot('run_024');

        expect(snap000.events).toEqual([]); // run_000 被淘汰
        expect(snap019.events.length).toBeGreaterThan(0); // 边界还在
        expect(snap024.events.length).toBeGreaterThan(0); // 最新还在
    });
});
