/**
 * 事件发射器工厂 —— 内部为单 run 维护一个递增 sequence,emit 时自动补
 * runId/seq/timestamp。redactSecrets 把 LLM 响应里的 api key 等敏感串
 * 替换成 [REDACTED],防止泄漏到 renderer。
 *
 * 用法:
 *   const emit = createSequencedEventEmitter({
 *       runId: 'r1',
 *       sink: (evt) => baseEmit(evt)
 *   });
 *   emit({ type: 'node.started', nodeName: 'scan_assets', ... });
 */

import { z } from 'zod';

import { type AgentRunEvent, AgentRunEventSchema } from './agent-run-event.ts';

const SECRET_PATTERNS: RegExp[] = [
    /sk-[A-Za-z0-9_-]{16,}/g,
    /ark-[A-Za-z0-9_-]{16,}/g,
    /AKID[A-Za-z0-9]{16,}/g
];

export const redactSecrets = (input: string): string =>
    SECRET_PATTERNS.reduce(
        (acc, pattern) => acc.replace(pattern, '[REDACTED]'),
        input
    );

const RedactedFieldSchema = z.string().transform(redactSecrets);

export const redactEventPayload = (event: AgentRunEvent): AgentRunEvent => {
    const cloned = JSON.parse(JSON.stringify(event)) as Record<string, unknown>;

    // delta / error / payload 等可能含泄漏串的字段统一过 redactSecrets
    for (const key of ['delta', 'error', 'message', 'text']) {
        const value = cloned[key];
        if (typeof value === 'string') {
            const result = RedactedFieldSchema.safeParse(value);
            if (result.success) cloned[key] = result.data;
        }
    }

    return AgentRunEventSchema.parse(cloned);
};

export type SequencedEventEmitter = (event: {
    type: AgentRunEvent['type'];
    [key: string]: unknown;
}) => void;

export type AgentRunEventSink = (event: AgentRunEvent) => void;

export const createSequencedEventEmitter = (options: {
    runId: string;
    sink: AgentRunEventSink;
}): SequencedEventEmitter => {
    let sequence = 0;

    return (event) => {
        sequence += 1;
        const fullEvent = {
            ...event,
            runId: options.runId,
            seq: sequence,
            timestamp: Date.now()
        } as unknown as AgentRunEvent;

        const safe = AgentRunEventSchema.safeParse(fullEvent);
        if (!safe.success) {
            // eslint-disable-next-line no-console
            console.error(
                '[event-emitter] invalid event shape',
                safe.error.issues,
                fullEvent
            );
            return;
        }

        options.sink(redactEventPayload(safe.data));
    };
};
