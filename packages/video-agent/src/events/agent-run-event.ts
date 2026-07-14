/**
 * video-agent 事件 union —— 13 种 AgentRunEvent 的 Zod discriminated union。
 *
 * 设计要点(plan §4):
 *   - 所有事件共享 runId + seq + timestamp + type
 *   - 用 discriminated union 让 renderer / 测试用 switch 窄类型
 *   - controller 端 emit 出去的 raw event 由 createSequencedEventEmitter
 *     补 seq/timestamp,调用者只填事件特有字段
 *
 * 注意:本文件用 Zod schema 校验任意 emit 出来的 raw event 形状,
 * 用 z.infer 派生 TypeScript 类型 — 单一来源。
 */

import { z } from 'zod';

const BaseEventFields = {
    runId: z.string().min(1),
    seq: z.number().int().nonnegative(),
    timestamp: z.number().int().nonnegative(),
    type: z.string().min(1)
};

const RunStartedSchema = z.object({
    ...BaseEventFields,
    input: z.unknown(),
    type: z.literal('run.started')
});

const NodeStartedSchema = z.object({
    ...BaseEventFields,
    nodeLabel: z.string().optional(),
    nodeName: z.string().min(1),
    type: z.literal('node.started')
});

const NodeProgressSchema = z.object({
    ...BaseEventFields,
    message: z.string().optional(),
    nodeName: z.string().min(1),
    progress: z.number().min(0).max(100),
    type: z.literal('node.progress')
});

const NodeCompletedSchema = z.object({
    ...BaseEventFields,
    durationMs: z.number().int().nonnegative(),
    nodeName: z.string().min(1),
    type: z.literal('node.completed')
});

const NodeFailedSchema = z.object({
    ...BaseEventFields,
    error: z.string(),
    nodeName: z.string().min(1),
    type: z.literal('node.failed')
});

const ModelStreamStartedSchema = z.object({
    ...BaseEventFields,
    model: z.string(),
    type: z.literal('model.stream.started')
});

const ModelStreamDeltaSchema = z.object({
    ...BaseEventFields,
    delta: z.string(),
    type: z.literal('model.stream.delta')
});

const ModelStreamCompletedSchema = z.object({
    ...BaseEventFields,
    totalTokens: z.number().int().nonnegative(),
    type: z.literal('model.stream.completed')
});

const ModelDeltaSchema = z.object({
    ...BaseEventFields,
    delta: z.string(),
    type: z.literal('model.delta')
});

const VoiceRegenerationProgressSchema = z.object({
    ...BaseEventFields,
    current: z.number().int().nonnegative(),
    percent: z.number().min(0).max(100),
    total: z.number().int().positive(),
    type: z.literal('voice.regeneration.progress')
});

const InterruptSchema = z.object({
    ...BaseEventFields,
    interruptType: z.string().min(1),
    payload: z.unknown(),
    type: z.literal('interrupt')
});

const InterruptResumedSchema = z.object({
    ...BaseEventFields,
    interruptType: z.string(),
    type: z.literal('interrupt.resumed')
});

const ApprovalRequiredSchema = z.object({
    ...BaseEventFields,
    approval: z.unknown(),
    type: z.literal('approval.required')
});

const RunCompletedSchema = z.object({
    ...BaseEventFields,
    durationMs: z.number().int().nonnegative(),
    projectId: z.string(),
    projectPath: z.string(),
    savedProjectPath: z.string().optional(),
    type: z.literal('run.completed')
});

const RunFailedSchema = z.object({
    ...BaseEventFields,
    error: z.string(),
    type: z.literal('run.failed')
});

const RunCancelledSchema = z.object({
    ...BaseEventFields,
    type: z.literal('run.cancelled')
});

export const AgentRunEventSchema = z.discriminatedUnion('type', [
    RunStartedSchema,
    NodeStartedSchema,
    NodeProgressSchema,
    NodeCompletedSchema,
    NodeFailedSchema,
    ModelStreamStartedSchema,
    ModelStreamDeltaSchema,
    ModelStreamCompletedSchema,
    ModelDeltaSchema,
    VoiceRegenerationProgressSchema,
    InterruptSchema,
    InterruptResumedSchema,
    ApprovalRequiredSchema,
    RunCompletedSchema,
    RunFailedSchema,
    RunCancelledSchema
]);

export type AgentRunEvent = z.infer<typeof AgentRunEventSchema>;

export type AgentRunEventType = AgentRunEvent['type'];
