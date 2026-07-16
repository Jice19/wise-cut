/* */
import type { z } from 'zod';

import type {
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

export type VideoProject = z.infer<typeof VideoProjectSchema>;

export type ProjectMetadata = z.infer<typeof ProjectMetadataSchema>;

export type CanvasConfig = z.infer<typeof CanvasConfigSchema>;

export type ProjectAssets = z.infer<typeof ProjectAssetsSchema>;

export type Scene = z.infer<typeof SceneSchema>;

export type TimelineTrackKind = z.infer<typeof TimelineTrackKindSchema>;

export type TimelineTrack = z.infer<typeof TimelineTrackSchema>;

export type TimelineClip = z.infer<typeof TimelineClipSchema>;

export type VideoClip = z.infer<typeof VideoClipSchema>;

export type VoiceClip = z.infer<typeof VoiceClipSchema>;

export type SubtitleClip = z.infer<typeof SubtitleClipSchema>;

export type MusicClip = z.infer<typeof MusicClipSchema>;

export type RenderConfig = z.infer<typeof RenderConfigSchema>;

export type AiRunMetadata = z.infer<typeof AiRunMetadataSchema>;

export type AgentConversationMessage = z.infer<
    typeof AgentConversationMessageSchema
>;

export type AgentConversationBlock = z.infer<
    typeof AgentConversationBlockSchema
>;

export type VideoProjectValidationResult =
    | {
          data: VideoProject;
          success: true;
      }
    | {
          issues: string[];
          success: false;
      };
