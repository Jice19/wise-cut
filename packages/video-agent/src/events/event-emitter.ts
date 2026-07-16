/* */
import type { AgentRunEvent, AgentRunEventBase } from './agent-run-event';

type AgentRunEventInput = AgentRunEvent extends infer Event
    ? Event extends AgentRunEventBase
        ? Omit<Event, keyof AgentRunEventBase>
        : never
    : never;

export type AgentRunEventEmitter = (event: AgentRunEvent) => void;

export const redactSecrets = (value: string): string =>
    value.replace(/ark-[A-Za-z0-9_-]+/g, '[REDACTED]');

export const serializeError = (error: unknown): string => {
    if (error instanceof Error) {
        return redactSecrets(error.message);
    }

    if (typeof error === 'string') {
        return redactSecrets(error);
    }

    return redactSecrets(JSON.stringify(error));
};

export const createSequencedEventEmitter = ({
    emit,
    runId
}: {
    emit?: AgentRunEventEmitter;
    runId: string;
}) => {
    let sequence = 0;

    return {
        emit: (event: AgentRunEventInput) => {
            sequence += 1;
            emit?.({
                ...event,
                createdAt: new Date().toISOString(),
                runId,
                sequence
            } as AgentRunEvent);
        }
    };
};
