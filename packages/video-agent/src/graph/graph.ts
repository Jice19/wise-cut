/**
 * LangGraph StateGraph 装配 —— commit 6.5 完整 10 节点拓扑。
 *
 * START
 *   → scan_assets
 *   → analyze_assets
 *   → creative_brief
 *   → plan_scenes
 *   → scene_approval(用 LangGraph interrupt())
 *   → match_assets
 *   → synthesize_voice
 *   → assemble_timeline
 *   → validate_project
 *   → save_project
 *   → END
 *
 * 驳回路径:scene_approval 抛 'Scene plan rejected' → LangGraph 向上抛
 * GraphInterrupt,controller 端 catch 后 emit run.failed。
 *
 * 用法:
 *   const graph = createVideoCreationGraph({ runtime, checkpointer });
 *   const result = await graph.invoke(initialState, {
 *       configurable: { thread_id: runId }
 *   });
 *   // approve resume:
 *   const result2 = await graph.invoke(new Command({ resume: { approved: true } }), {
 *       configurable: { thread_id: runId }
 *   });
 */

import { Command, END, START, StateGraph } from '@langchain/langgraph';

import type { VideoCreationCheckpointer } from './checkpoint.ts';
import type { NodeRuntime } from './node-runtime.ts';
import {
    analyzeAssetsNode,
    assembleTimelineNode,
    creativeBriefNode,
    matchAssetsNode,
    planScenesNode,
    saveProjectNode,
    scanAssetsNode,
    sceneApprovalNode,
    synthesizeVoiceNode,
    validateProjectNode
} from './nodes.ts';
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
        .addNode('creative_brief', (state) =>
            creativeBriefNode(state, options.runtime)
        )
        .addNode('plan_scenes', (state) =>
            planScenesNode(state, options.runtime)
        )
        .addNode('scene_approval', (state) =>
            sceneApprovalNode(state, options.runtime)
        )
        .addNode('match_assets', (state) =>
            matchAssetsNode(state, options.runtime)
        )
        .addNode('synthesize_voice', (state) =>
            synthesizeVoiceNode(state, options.runtime)
        )
        .addNode('assemble_timeline', (state) =>
            assembleTimelineNode(state, options.runtime)
        )
        .addNode('validate_project', (state) =>
            validateProjectNode(state, options.runtime)
        )
        .addNode('save_project', (state) =>
            saveProjectNode(state, options.runtime)
        )
        .addEdge(START, 'scan_assets')
        .addEdge('scan_assets', 'analyze_assets')
        .addEdge('analyze_assets', 'creative_brief')
        .addEdge('creative_brief', 'plan_scenes')
        .addEdge('plan_scenes', 'scene_approval')
        .addEdge('scene_approval', 'match_assets')
        .addEdge('match_assets', 'synthesize_voice')
        .addEdge('synthesize_voice', 'assemble_timeline')
        .addEdge('assemble_timeline', 'validate_project')
        .addEdge('validate_project', 'save_project')
        .addEdge('save_project', END);

    return builder.compile({ checkpointer: options.checkpointer });
};

export type CompiledVideoCreationGraph = ReturnType<
    typeof createVideoCreationGraph
>;

export { Command };
export type { VideoCreationStateType };
