/**
 * LangGraph StateGraph 装配 —— commit 6 聚焦版。
 *
 * 拓扑:
 *   START → scan_assets → analyze_assets → END
 *
 * 其它 8 个节点留 commit 6.5 补。
 *
 * 用法:
 *   const graph = createVideoCreationGraph({ runtime, checkpointer });
 *   const result = await graph.invoke(initialState, {
 *       configurable: { thread_id: runId }
 *   });
 */

import { END, START, StateGraph } from '@langchain/langgraph';

import type { VideoCreationCheckpointer } from './checkpoint.ts';
import type { NodeRuntime } from './node-runtime.ts';
import { analyzeAssetsNode, scanAssetsNode } from './nodes.ts';
import { VideoCreationState, type VideoCreationStateType } from './state.ts';

export const createVideoCreationGraph = (options: {
    checkpointer: VideoCreationCheckpointer;
    runtime: NodeRuntime;
}) => {
    const builder = new StateGraph(VideoCreationState)
        .addNode('scan_assets', (state) =>
            scanAssetsNode(state, options.runtime)
        )
        .addNode('analyze_assets', (state) =>
            analyzeAssetsNode(state, options.runtime)
        )
        .addEdge(START, 'scan_assets')
        .addEdge('scan_assets', 'analyze_assets')
        .addEdge('analyze_assets', END);

    return builder.compile({ checkpointer: options.checkpointer });
};

export type CompiledVideoCreationGraph = ReturnType<
    typeof createVideoCreationGraph
>;

export type { VideoCreationStateType };
