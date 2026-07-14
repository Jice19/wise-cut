/**
 * Node runtime —— 每个 LangGraph node 收到的运行时上下文。
 *
 * commit 6 阶段:ffmpeg / ffprobe / frame 输出目录 / LLM provider / tools
 * commit 6.5 阶段扩:voiceOutputDirectory / projectOutputDirectory(给
 * synthesize_voice + save_project 节点用)
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
    projectOutputDirectory: string;
    tools: VideoAgentTools;
    voiceOutputDirectory: string;
};
