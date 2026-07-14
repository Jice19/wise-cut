/**
 * LangGraph StateGraph 的状态 schema —— Annotation.Root 定义 10 个 field:
 *   input / assets / brief / scenes / matches / voices / project /
 *   savedProjectPath / errors / status
 *
 * 同时 export `SceneApprovalRequest` / `SceneApprovalResume` 类型
 * ( 项目规范把这两个跟 state 放一起,scene_approval 节点用
 * interrupt<>() 需要它们)。
 *
 *  项目 graph 目录规范 4 文件:
 *   - state.ts (本文件)
 *   - checkpoint.ts (createVideoCreationCheckpointer)
 *   - nodes.ts (createVideoCreationNodes 工厂)
 *   - create-video-creation-graph.ts (start / resume runner)
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

// SceneApprovalRequest / SceneApprovalResume 在 node-payloads.ts 定义
// (保持与 CreativeBriefPayload / ScenePlannerPayload / AssetMatcherPayload
// 同文件,便于 LLM raw payload 类型集中管理)。

export const VideoCreationStateAnnotation = Annotation.Root({
    input: Annotation<VideoCreationInput | undefined>(),
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

export type VideoCreationGraphState = typeof VideoCreationStateAnnotation.State;

/**
 * 初始状态工厂 —— commit 6.5 阶段只填 input,其它 9 个 field 用 undefined/[]。
 */
export const buildInitialState = (
    input: VideoCreationInput
): VideoCreationGraphState => ({
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
