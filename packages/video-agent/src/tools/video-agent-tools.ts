/* */
import type { VideoProject } from '@wise-cut/video-project';

import type { CreativeBrief } from '../prompts/creative-brief';
import type { PlannedScene } from '../prompts/scene-planner';
import type { ModelReportInput } from '../providers/model-provider';

export type AssetAnalysis = {
    assetId: string;
    description: string;
    durationMs: number;
    /**
     * Frames per second of the source asset. Optional because older
     * analysis payloads persisted before this field was introduced may
     * not carry it; downstream code should fall back to a sensible
     * default (e.g. 30 fps) when missing.
     */
    fps?: number;
    /**
     * Pixel height of the source asset. Optional for the same reason as
     * `fps`; downstream should fall back to the canvas height.
     */
    height?: number;
    /**
     * Pixel width of the source asset. Optional for the same reason as
     * `fps`; downstream should fall back to the canvas width.
     */
    width?: number;
};

export type AssetMatchResult = {
    rankedAssetIds: {
        assetId: string;
        reason: string;
        score: number;
    }[];
    sceneId: string;
};

export type VoiceSynthesisResult = {
    assetId: string;
    durationMs: number;
    lineIndex: number;
    path: string;
    /**
     * Stable identifier of the TTS provider that produced this asset
     * (matches `TtsProvider.providerName`). Persisted on
     * `VideoProject.assets.voices[].provider`. Optional because offline /
     * placeholder synthesis paths do not have a real provider.
     */
    provider?: string;
    sceneId: string;
    text: string;
};

export type VideoCreationInput = {
    prompt: string;
    runId: string;
    selectedVoiceType?: string;
    sourceAssetDirectory: string;
};

export type ProjectValidationResult =
    | {
          success: true;
      }
    | {
          error: string;
          success: false;
      };

export type SavedVideoProject = {
    path: string;
    project: VideoProject;
};

export type VideoAgentTools = {
    analyzeAssets: (input: {
        assets: AssetAnalysis[];
        input: VideoCreationInput;
    }) => Promise<AssetAnalysis[]>;
    assembleTimeline: (input: {
        assets: AssetAnalysis[];
        brief: CreativeBrief;
        input: VideoCreationInput;
        matches: AssetMatchResult[];
        scenes: PlannedScene[];
        voices: VoiceSynthesisResult[];
    }) => Promise<VideoProject>;
    generateCreativeBrief: (input: {
        assets: AssetAnalysis[];
        input: VideoCreationInput;
    }) => Promise<CreativeBrief>;
    matchAssets: (input: {
        assets: AssetAnalysis[];
        input: VideoCreationInput;
        scenes: PlannedScene[];
    }) => Promise<AssetMatchResult[]>;
    planScenes: (input: {
        assets: AssetAnalysis[];
        brief: CreativeBrief;
        input: VideoCreationInput;
    }) => Promise<PlannedScene[]>;
    saveProject: (input: {
        project: VideoProject;
    }) => Promise<SavedVideoProject>;
    scanAssets: (input: {
        input: VideoCreationInput;
    }) => Promise<AssetAnalysis[]>;
    streamReport?: (
        input: ModelReportInput,
        emitDelta: (delta: string) => void | Promise<void>
    ) => Promise<string>;
    synthesizeVoice: (input: {
        brief: CreativeBrief;
        input: VideoCreationInput;
        scenes: PlannedScene[];
    }) => Promise<VoiceSynthesisResult[]>;
    validateProject: (input: {
        project: VideoProject;
    }) => Promise<ProjectValidationResult>;
};
