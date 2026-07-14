/**
 * LangGraph StateGraph 的状态 schema —— Annotation.Root 定义 10 个 field
 * (plan §2 / commit 6.5):
 *   input / assets / brief / scenes / matches / voices / project /
 *   savedProjectPath / errors / status
 *
 * 用法:
 *   const graph = new StateGraph(VideoCreationState)
 *       .addNode('scan_assets', scanAssetsNode)
 *       .addNode('analyze_assets', analyzeAssetsNode)
 *       .addNode('creative_brief', creativeBriefNode)
 *       ...
 *       .addEdge(START, 'scan_assets')
 *       .compile();
 *   const result = await graph.invoke(initialState, {
 *       configurable: { thread_id: runId }
 *   });
 */

import { Annotation } from '@langchain/langgraph';
import type {
    AssetAnalysis,
    AssetMatchResult,
    CreativeBrief,
    Scene,
    VideoProject,
    VoiceSynthesisResult
} from '@miaoma-magicut/video-project';

/**
 * 用户输入(commit 6 阶段 video-agent 自带,不依赖 apps/desktop 的 shared/ipc.ts)。
 * apps/desktop 端把 IPC 输入 cast 到本类型后传给 controller。
 */
export type VideoCreationInput = {
    brief: string;
    runId: string;
    selectedVoiceType?: string;
    sourceAssetDirectory: string;
};
export type RunStatus =
    | 'idle'
    | 'running'
    | 'awaiting_approval'
    | 'completed'
    | 'failed'
    | 'cancelled';

export const VideoCreationState = Annotation.Root({
    input: Annotation<VideoCreationInput>(),
    assets: Annotation<AssetAnalysis[]>(),
    brief: Annotation<CreativeBrief | undefined>(),
    scenes: Annotation<Scene[]>(),
    matches: Annotation<AssetMatchResult[]>(),
    voices: Annotation<VoiceSynthesisResult[]>(),
    project: Annotation<VideoProject | undefined>(),
    savedProjectPath: Annotation<string | undefined>(),
    errors: Annotation<string[]>(),
    status: Annotation<RunStatus>()
});

export type VideoCreationStateType = typeof VideoCreationState.State;

/**
 * 初始状态工厂 —— commit 6.5 阶段只填 input,其它 9 个 field 用 undefined/[]。
 */
export const buildInitialState = (
    input: VideoCreationInput
): VideoCreationStateType => ({
    assets: [],
    brief: undefined,
    errors: [],
    input,
    matches: [],
    project: undefined,
    savedProjectPath: undefined,
    scenes: [],
    status: 'running',
    voices: []
});
