/* */
export { sampleVideoProject } from './fixtures/sample-project';
export {
    AgentConversationBlockSchema,
    AgentConversationMessageSchema,
    AiRunMetadataSchema,
    CanvasConfigSchema,
    MusicClipSchema,
    ProjectAssetsSchema,
    ProjectMetadataSchema,
    RenderConfigSchema,
    SceneSchema,
    SubtitleClipSchema,
    TimelineClipSchema,
    TimelineTrackKindSchema,
    TimelineTrackSchema,
    VideoClipSchema,
    VideoProjectSchema,
    VoiceClipSchema
} from './schema';
export type {
    AgentConversationBlock,
    AgentConversationMessage,
    AiRunMetadata,
    CanvasConfig,
    MusicClip,
    ProjectAssets,
    ProjectMetadata,
    RenderConfig,
    Scene,
    SubtitleClip,
    TimelineClip,
    TimelineTrack,
    TimelineTrackKind,
    VideoClip,
    VideoProject,
    VideoProjectValidationResult,
    VoiceClip
} from './types';
export {
    assertVideoProject,
    validateVideoProject,
    VideoProjectValidationError
} from './validation';
