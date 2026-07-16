/* */
import type {
    AssetMatchCandidate,
    AssetMatchRanking
} from '../prompts/asset-matcher';
import type {
    CreativeBrief,
    CreativeBriefInput
} from '../prompts/creative-brief';
import type {
    FrameDescription,
    FrameDescriptionInput
} from '../prompts/frame-description';
import type { PlannedScene, ScenePlanInput } from '../prompts/scene-planner';

export type TextEmbedding = {
    embedding: number[];
    text: string;
};

export type ModelReportInput = {
    context?: string;
    prompt: string;
    title: string;
};

export type ModelProvider = {
    embedTexts: (input: { texts: string[] }) => Promise<TextEmbedding[]>;
    streamReport?: (
        input: ModelReportInput,
        emitDelta: (delta: string) => void | Promise<void>
    ) => Promise<string>;
    generateCreativeBrief: (
        input: CreativeBriefInput
    ) => Promise<CreativeBrief>;
    describeFrames: (input: {
        frames: FrameDescriptionInput[];
    }) => Promise<FrameDescription[]>;
    planScenes: (input: ScenePlanInput) => Promise<PlannedScene[]>;
    rankAssetMatches: (input: {
        candidates: AssetMatchCandidate[];
        scenes: PlannedScene[];
    }) => Promise<AssetMatchRanking[]>;
};
