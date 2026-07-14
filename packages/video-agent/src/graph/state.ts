/**
 * LangGraph StateGraph 的状态 schema —— Annotation.Root 定义 4 个
 * field: input / assets / errors / status。其它 6 个 field (brief / scenes /
 * matches / voices / project / savedProjectPath) 留 commit 6.5 补。
 *
 * 用法:
 *   const graph = new StateGraph(VideoCreationState)
 *       .addNode('scan_assets', scanAssetsNode)
 *       .addNode('analyze_assets', analyzeAssetsNode)
 *       .addEdge(START, 'scan_assets')
 *       .addEdge('scan_assets', 'analyze_assets')
 *       .addEdge('analyze_assets', END)
 *       .compile();
 *   const result = await graph.invoke(initialState, {
 *       configurable: { thread_id: runId }
 *   });
 */

import { Annotation } from '@langchain/langgraph';
import type { AssetAnalysis } from '@miaoma-magicut/video-project';

/**
 * 用户输入(commit 6 阶段 video-agent 自带,不依赖 apps/desktop 的 shared/ipc.ts)。
 * apps/desktop 端把 IPC 输入 cast 到本类型后传给 controller。
 */
export type VideoCreationInput = {
    brief: string;
    runId: string;
    sourceAssetDirectory: string;
    selectedVoiceType?: string;
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
    errors: Annotation<string[]>(),
    status: Annotation<RunStatus>()
});

export type VideoCreationStateType = typeof VideoCreationState.State;

/**
 * 初始状态工厂 —— commit 6 聚焦:只有 input,assets/errors/status 用空值。
 */
export const buildInitialState = (
    input: VideoCreationInput
): VideoCreationStateType => ({
    assets: [],
    errors: [],
    input,
    status: 'running'
});
