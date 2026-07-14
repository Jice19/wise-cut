/**
 * useVideoAgent reducer 纯逻辑测试 —— 不需要 jsdom/happy-dom。
 *
 * 断言:
 *   - run.started 重置 nodes + 设 runId
 *   - node.started/completed/progress/failed 维护 nodes map
 *   - interrupt → runStatus=awaiting_approval + interrupt payload
 *   - interrupt.resumed → 清空 interrupt + 回到 running
 *   - run.completed/failed/cancelled 走终态
 */

import { describe, expect, it } from 'vitest';

import type { AgentRunEvent } from '../../shared/ipc';
import {
    type Action,
    videoAgentReducer,
    type VideoAgentState
} from '../hooks/useVideoAgent.ts';

const EMPTY: VideoAgentState = {
    interrupt: null,
    nodes: {},
    runId: null,
    runStatus: 'idle'
};

const baseEvent = {
    runId: 'r-base',
    seq: 1,
    timestamp: Date.now()
} as const;

const evt = (
    e: Record<string, unknown> & { type: AgentRunEvent['type']; runId?: string }
): AgentRunEvent =>
    ({
        ...baseEvent,
        ...e,
        runId: e.runId ?? baseEvent.runId
    }) as unknown as AgentRunEvent;

const dispatch = (
    state: ReturnType<typeof videoAgentReducer>,
    action: Action
) => videoAgentReducer(state, action);

describe('videoAgentReducer', () => {
    it('run.started 重置状态 + 设 runId', () => {
        let s = dispatch(
            {
                interrupt: null,
                nodes: {},
                runId: 'r-old',
                runStatus: 'failed'
            },
            { type: 'reset' }
        );
        s = dispatch(s, {
            event: evt({
                runId: 'r-new',
                input: {
                    brief: 'y',
                    runId: 'r-new',
                    sourceAssetDirectory: '/tmp'
                },
                type: 'run.started'
            })
        });

        expect(s.runId).toBe('r-new');
        expect(s.runStatus).toBe('running');
        expect(s.nodes).toEqual({});
    });

    it('node.started/completed 维护 nodes map', () => {
        let s = dispatch(EMPTY, {
            event: evt({
                input: {
                    brief: 'x',
                    runId: 'r1',
                    sourceAssetDirectory: '/tmp'
                },
                type: 'run.started'
            })
        });

        s = dispatch(s, {
            event: evt({
                nodeLabel: '扫描素材',
                nodeName: 'scan_assets',
                type: 'node.started'
            })
        });
        expect(s.nodes['scan_assets']?.status).toBe('running');
        expect(s.nodes['scan_assets']?.label).toBe('扫描素材');
        expect(s.nodes['scan_assets']?.progress).toBe(0);

        s = dispatch(s, {
            event: evt({
                nodeName: 'scan_assets',
                progress: 50,
                type: 'node.progress'
            })
        });
        expect(s.nodes['scan_assets']?.progress).toBe(50);

        s = dispatch(s, {
            event: evt({
                durationMs: 1000,
                nodeName: 'scan_assets',
                type: 'node.completed'
            })
        });
        expect(s.nodes['scan_assets']?.status).toBe('completed');
        expect(s.nodes['scan_assets']?.progress).toBe(100);
        expect(s.nodes['scan_assets']?.durationMs).toBe(1000);
    });

    it('node.failed 写到 error 字段', () => {
        let s = dispatch(EMPTY, {
            event: evt({
                input: {
                    brief: 'x',
                    runId: 'r1',
                    sourceAssetDirectory: '/tmp'
                },
                type: 'run.started'
            })
        });
        s = dispatch(s, {
            event: evt({
                error: 'boom',
                nodeName: 'analyze_assets',
                type: 'node.failed'
            })
        });
        expect(s.nodes['analyze_assets']?.status).toBe('failed');
        expect(s.nodes['analyze_assets']?.error).toBe('boom');
    });

    it('interrupt → runStatus=awaiting_approval + payload', () => {
        let s = dispatch(EMPTY, {
            event: evt({
                input: {
                    brief: 'x',
                    runId: 'r1',
                    sourceAssetDirectory: '/tmp'
                },
                type: 'run.started'
            })
        });

        const payload = {
            payload: {
                brief: {
                    audience: 'z',
                    keyMessages: ['k'],
                    summary: 's',
                    title: 't',
                    tone: 'tt'
                },
                scenes: [
                    {
                        endMs: 1000,
                        narration: 'n',
                        sceneId: 's1',
                        startMs: 0,
                        visualBrief: 'v'
                    }
                ]
            },
            type: 'scene-plan' as const
        };

        s = dispatch(s, {
            event: evt({
                interruptType: 'scene_approval',
                payload,
                type: 'interrupt'
            })
        });

        expect(s.runStatus).toBe('awaiting_approval');
        expect(s.interrupt).toEqual(payload);
    });

    it('interrupt.resumed 清空 interrupt + 回到 running', () => {
        let s = dispatch(EMPTY, {
            event: evt({
                input: {
                    brief: 'x',
                    runId: 'r1',
                    sourceAssetDirectory: '/tmp'
                },
                type: 'run.started'
            })
        });
        s = dispatch(s, {
            event: evt({
                interruptType: 'scene_approval',
                payload: {
                    payload: { scenes: [] },
                    type: 'scene-plan'
                },
                type: 'interrupt'
            })
        });
        s = dispatch(s, {
            event: evt({
                interruptType: 'scene_approval',
                type: 'interrupt.resumed'
            })
        });

        expect(s.interrupt).toBeNull();
        expect(s.runStatus).toBe('running');
    });

    it('run.completed 写入 projectPath', () => {
        let s = dispatch(EMPTY, {
            event: evt({
                input: {
                    brief: 'x',
                    runId: 'r1',
                    sourceAssetDirectory: '/tmp'
                },
                type: 'run.started'
            })
        });
        s = dispatch(s, {
            event: evt({
                durationMs: 5000,
                projectPath: '/tmp/proj-r1.json',
                type: 'run.completed'
            })
        });

        expect(s.runStatus).toBe('completed');
        expect(s.projectPath).toBe('/tmp/proj-r1.json');
    });

    it('run.failed 写入 errorMessage', () => {
        let s = dispatch(EMPTY, {
            event: evt({
                input: {
                    brief: 'x',
                    runId: 'r1',
                    sourceAssetDirectory: '/tmp'
                },
                type: 'run.started'
            })
        });
        s = dispatch(s, {
            event: evt({
                error: 'fatal',
                type: 'run.failed'
            })
        });

        expect(s.runStatus).toBe('failed');
        expect(s.errorMessage).toBe('fatal');
    });

    it('run.cancelled 走 cancelled 终态', () => {
        let s = dispatch(EMPTY, {
            event: evt({
                input: {
                    brief: 'x',
                    runId: 'r1',
                    sourceAssetDirectory: '/tmp'
                },
                type: 'run.started'
            })
        });
        s = dispatch(s, { event: evt({ type: 'run.cancelled' }) });

        expect(s.runStatus).toBe('cancelled');
    });
});
