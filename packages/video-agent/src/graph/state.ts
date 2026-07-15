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

// SceneApprovalRequest / SceneApprovalResume —— scene_approval 节点
// interrupt<>() 用,跟 state 在同一文件方便一起导入。
export type SceneApprovalRequest = {
    payload: {
        brief?: {
            audience: string;
            keyMessages: string[];
            summary: string;
            title: string;
            tone: string;
        };
        scenes: {
            endMs: number;
            narration: string;
            sceneId: string;
            startMs: number;
            visualBrief: string;
        }[];
    };
    type: 'scene-plan';
};

export type SceneApprovalResume = {
    approved: boolean;
    feedback?: string;
};

/**
 * commit 15 — 帧分组分析结果,存到 VideoProject.aiRunMetadata。
 * 由 analyzeAssets 之后调 LLM 按时间窗聚合输出。
 */
export type KeyFrameWindowAnalysis = {
    frameIds: string[];
    summary: string;
    windowEnd: number;
    windowIndex: number;
    windowStart: number;
};

export type VideoAnalysisResult = {
    keyFrameAnalysis: KeyFrameWindowAnalysis[];
    overallUnderstanding: string;
    summary: string;
};

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
    status: Annotation<RunStatus>(),
    // commit 12:scene_approval 驳回/反馈修改时存用户 feedback,
    // conditional edge 看到 feedback 非空就跳回 plan_scenes 重跑。
    feedback: Annotation<string | undefined>(),
    // commit 15:帧分组分析结果(LLM 按时间窗聚合 + 整体理解)
    analysisResult: Annotation<VideoAnalysisResult | undefined>()
});

export type VideoCreationGraphState = typeof VideoCreationStateAnnotation.State;

/**
 * 初始状态工厂 —— commit 6.5 阶段只填 input,其它 9 个 field 用 undefined/[]。
 */
export const buildInitialState = (
    input: VideoCreationInput
): VideoCreationGraphState => ({
    analysisResult: undefined,
    assets: [],
    brief: undefined,
    errors: [],
    feedback: undefined,
    input,
    matches: [],
    project: undefined,
    savedProjectPath: undefined,
    scenes: [],
    status: 'running',
    voices: []
});
