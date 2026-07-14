/**
 * Node runtime —— 每个 LangGraph node 收到的运行时上下文。
 *
 * commit 6 阶段只为节点提供 ffmpeg / ffprobe / frame 输出目录 / LLM provider /
 * tools。emit 由 createSequencedEventEmitter 提供的 emitter,自动补 runId /
 * seq / timestamp。
 */

import type { SequencedEventEmitter } from '../events/event-emitter.ts';
import type { ModelProvider } from '../providers/model-provider.ts';
import type { VideoAgentTools } from '../tools/video-agent-tools.ts';

export type NodeRuntime = {
    emit: SequencedEventEmitter;
    ffmpegPath: string;
    ffprobePath: string;
    frameOutputDirectory: string;
    modelProvider: ModelProvider;
    tools: VideoAgentTools;
};
