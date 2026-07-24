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

export type DescribeImagesInput = {
    /** 用户原始 prompt,用来判断代表帧跟创作意图的匹配度 */
    userPrompt: string;
    /** 关键帧 dataUrl(base64) + 帧原始 timestampMs,帮助模型理解"画面在哪个时间点" */
    frames: {
        dataUrl: string;
        index: number;
        timestampMs: number;
    }[];
};

export type DescribedImage = {
    /** 一句话描述画面(15-30 字) */
    description: string;
    /** 整体氛围/调性(5-10 字) */
    mood: string;
    /** 关键物体 */
    objects: string[];
    /** 关键动作 */
    actions: string[];
    /** 适合做哪种分镜(教程/口播/剧情/演示 等) */
    suggestedSceneType: string;
    /** 与用户 prompt 的匹配度 0-1 */
    promptMatchScore: number;
    /** 匹配度解释(20-40 字) */
    promptMatchReason: string;
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
    /** 多模态理解:把代表帧 + 用户 prompt 一起喂给多模态模型,返回画面描述 + 分镜建议 */
    describeImages?: (input: DescribeImagesInput) => Promise<DescribedImage>;
    planScenes: (input: ScenePlanInput) => Promise<PlannedScene[]>;
    rankAssetMatches: (input: {
        candidates: AssetMatchCandidate[];
        scenes: PlannedScene[];
    }) => Promise<AssetMatchRanking[]>;
};
