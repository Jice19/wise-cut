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
    runId: Annotation<string>,
    savedProjectPath: Annotation<string | undefined>,
    scenes: Annotation<PlannedScene[]>,
    voices: Annotation<VoiceSynthesisResult[]>
});

export type VideoCreationGraphState = typeof VideoCreationStateAnnotation.State;
