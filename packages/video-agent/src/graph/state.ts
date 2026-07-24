/* */
import { Annotation } from '@langchain/langgraph';
import type { VideoProject } from '@wise-cut/video-project';

import type { CreativeBrief } from '../prompts/creative-brief';
import type { PlannedScene } from '../prompts/scene-planner';
import type {
    AssetAnalysis,
    AssetMatchResult,
    VideoCreationInput,
    VoiceSynthesisResult
} from '../tools/video-agent-tools';

export type SceneApprovalResume = {
    approved: boolean;
    /**
     * 可选:用户对分镜方案的反馈。当 approved=false 时,会被传到
     * plan_scenes 节点重新拆分镜时用,作为 LLM 的额外输入。
     * 当 approved=true 时忽略。
     */
    feedback?: string;
};

export type SceneApprovalRequest = {
    payload: {
        brief?: CreativeBrief;
        scenes: PlannedScene[];
    };
    type: 'scene-plan';
};

export const VideoCreationStateAnnotation = Annotation.Root({
    assets: Annotation<AssetAnalysis[]>,
    brief: Annotation<CreativeBrief | undefined>,
    errors: Annotation<string[]>,
    input: Annotation<VideoCreationInput | undefined>,
    matches: Annotation<AssetMatchResult[]>,
    project: Annotation<VideoProject | undefined>,
    /**
     * 用户对分镜方案的最新反馈(scene_approval reject 时写入)。
     * plan_scenes 节点重跑时会读这个字段,作为 LLM 的额外输入。
     * approved 后不清空,留着方便调试和 regenerate 时复用。
     */
    sceneApprovalFeedback: Annotation<string | undefined>,
    runId: Annotation<string>,
    savedProjectPath: Annotation<string | undefined>,
    scenes: Annotation<PlannedScene[]>,
    voices: Annotation<VoiceSynthesisResult[]>
});

export type VideoCreationGraphState = typeof VideoCreationStateAnnotation.State;
