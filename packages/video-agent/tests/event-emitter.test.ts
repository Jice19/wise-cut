/**
 * event-emitter 单元测试 —— 序号递增 + redactSecrets 替换敏感串。
 */

import { describe, expect, it } from 'vitest';

import {
    type AgentRunEvent,
    createSequencedEventEmitter,
    redactSecrets
} from '../src/index.ts';
import { AgentRunEventSchema } from '../src/index.ts';

describe('createSequencedEventEmitter', () => {
    it('每次 emit seq 严格递增', () => {
        const collected: AgentRunEvent[] = [];
        const emit = createSequencedEventEmitter({
            runId: 'r1',
            sink: (evt) => collected.push(evt)
        });

        emit({ type: 'node.started', nodeName: 'scan_assets' });
        emit({
            type: 'node.completed',
            durationMs: 100,
            nodeName: 'scan_assets'
        });
        emit({
            type: 'run.completed',
            durationMs: 1000,
            projectId: 'proj-r1',
            projectPath: '/tmp/x.json'
        });

        expect(collected.map((e) => e.seq)).toEqual([1, 2, 3]);
        expect(collected.every((e) => e.runId === 'r1')).toBe(true);
    });

    it('所有事件都符合 AgentRunEventSchema', () => {
        const collected: AgentRunEvent[] = [];
        const emit = createSequencedEventEmitter({
            runId: 'r2',
            sink: (evt) => collected.push(evt)
        });

        emit({ type: 'node.started', nodeName: 'a' });
        emit({ type: 'node.progress', nodeName: 'a', progress: 50 });
        emit({ type: 'node.completed', durationMs: 100, nodeName: 'a' });

        for (const evt of collected) {
            expect(AgentRunEventSchema.safeParse(evt).success).toBe(true);
        }
    });

    it('所有事件都自动带 timestamp', () => {
        const collected: AgentRunEvent[] = [];
        const emit = createSequencedEventEmitter({
            runId: 'r3',
            sink: (evt) => collected.push(evt)
        });

        const before = Date.now();
        emit({ type: 'run.started', input: {} });
        const after = Date.now();

        expect(collected[0]!.timestamp).toBeGreaterThanOrEqual(before);
        expect(collected[0]!.timestamp).toBeLessThanOrEqual(after);
    });

    it('多个 emitter 之间 seq 独立', () => {
        const a: AgentRunEvent[] = [];
        const b: AgentRunEvent[] = [];

        const emitA = createSequencedEventEmitter({
            runId: 'a',
            sink: (e) => a.push(e)
        });
        const emitB = createSequencedEventEmitter({
            runId: 'b',
            sink: (e) => b.push(e)
        });

        emitA({ type: 'node.started', nodeName: 'x' });
        emitA({ type: 'node.started', nodeName: 'x' });
        emitB({ type: 'node.started', nodeName: 'y' });

        expect(a.map((e) => e.seq)).toEqual([1, 2]);
        expect(b.map((e) => e.seq)).toEqual([1]);
    });
});

describe('redactSecrets', () => {
    it('替换 ark- 开头的 key', () => {
        expect(redactSecrets('hello ark-abcdef1234567890xyz world')).toBe(
            'hello [REDACTED] world'
        );
    });

    it('替换 sk- 开头的 key', () => {
        expect(redactSecrets('sk-1234567890abcdefghijklmnop')).toBe(
            '[REDACTED]'
        );
    });

    it('不匹配 16 字符以下', () => {
        expect(redactSecrets('ark-short')).toBe('ark-short');
    });

    it('不影响正常文本', () => {
        expect(redactSecrets('这是正常的中文文本')).toBe('这是正常的中文文本');
    });

    it('delta 字段会被 redactEventPayload 替换', () => {
        const collected: AgentRunEvent[] = [];
        const emit = createSequencedEventEmitter({
            runId: 'r4',
            sink: (e) => collected.push(e)
        });

        emit({
            delta: 'prefix ark-1234567890abcdefghijklmnop suffix',
            type: 'model.delta'
        });

        const evt = collected[0]! as { delta: string };
        expect(evt.delta).not.toContain('ark-1234567890');
        expect(evt.delta).toContain('[REDACTED]');
    });

    it('非 delta 字段不受 redact 影响', () => {
        const collected: AgentRunEvent[] = [];
        const emit = createSequencedEventEmitter({
            runId: 'r5',
            sink: (e) => collected.push(e)
        });

        emit({
            type: 'node.completed',
            durationMs: 100,
            nodeName: 'scan_assets'
        });

        const evt = collected[0]! as { durationMs: number; nodeName: string };
        expect(evt.durationMs).toBe(100);
        expect(evt.nodeName).toBe('scan_assets');
    });
});
