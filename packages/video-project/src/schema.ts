/* */
import { z } from 'zod';

const idSchema = z.string().min(1);

const isoDateSchema = z.string().datetime({ offset: true });

const timeMsSchema = z.number().int().nonnegative();

const safeAreaSchema = z.object({
    height: z.number().int().positive(),
    width: z.number().int().positive(),
    x: z.number().int().nonnegative(),
    y: z.number().int().nonnegative()
});

const clipBaseSchema = z.object({
    endMs: timeMsSchema,
    id: idSchema,
    sceneId: idSchema.optional(),
    startMs: timeMsSchema
});

const cropSchema = z.object({
    height: z.number().positive(),
    width: z.number().positive(),
    x: z.number().nonnegative(),
    y: z.number().nonnegative()
});

const transformSchema = z.object({
    rotation: z.number(),
    scale: z.number().positive(),
    x: z.number(),
    y: z.number()
});

export const VideoClipSchema = clipBaseSchema.extend({
    assetId: idSchema,
    crop: cropSchema,
    kind: z.literal('video'),
    sourceEndMs: timeMsSchema,
    sourceStartMs: timeMsSchema,
    speed: z.number().min(0.5).max(2).optional(),
    transform: transformSchema
});

export const VoiceClipSchema = clipBaseSchema.extend({
    assetId: idSchema,
    kind: z.literal('voice'),
    speed: z.number().min(0.5).max(2).optional(),
    volume: z.number().min(0).max(1).optional(),
    voicePreset: idSchema
});

export const SubtitleClipSchema = clipBaseSchema.extend({
    kind: z.literal('subtitle'),
    subtitleId: idSchema,
    styleId: idSchema,
    text: z.string().min(1)
});

export const MusicClipSchema = clipBaseSchema.extend({
    assetId: idSchema,
    fadeInMs: timeMsSchema,
    fadeOutMs: timeMsSchema,
    kind: z.literal('music'),
    sourceEndMs: timeMsSchema,
    sourceStartMs: timeMsSchema,
    volume: z.number().min(0).max(1)
});

export const TimelineClipSchema = z.discriminatedUnion('kind', [
    VideoClipSchema,
    VoiceClipSchema,
    SubtitleClipSchema,
    MusicClipSchema
]);

export const TimelineTrackKindSchema = z.enum([
    'video',
    'voice',
    'subtitle',
    'music'
]);

export const TimelineTrackSchema = z.object({
    clips: z.array(TimelineClipSchema),
    id: idSchema,
    kind: TimelineTrackKindSchema,
    label: z.string().min(1)
});

const videoAssetSchema = z.object({
    durationMs: timeMsSchema,
    fps: z.number().positive(),
    height: z.number().int().positive(),
    id: idSchema,
    path: z.string().min(1),
    thumbnailIds: z.array(idSchema),
    width: z.number().int().positive()
});

const voiceAssetSchema = z.object({
    durationMs: timeMsSchema,
    id: idSchema,
    path: z.string().min(1),
    provider: z.string().min(1),
    voice: z.string().min(1)
});

const musicAssetSchema = z.object({
    durationMs: timeMsSchema,
    id: idSchema,
    path: z.string().min(1),
    title: z.string().min(1)
});

const subtitleAssetSchema = z.object({
    id: idSchema,
    styleId: idSchema,
    text: z.string().min(1)
});

const thumbnailAssetSchema = z.object({
    id: idSchema,
    path: z.string().min(1),
    sourceVideoAssetId: idSchema
});

export const ProjectAssetsSchema = z.object({
    music: z.array(musicAssetSchema),
    subtitles: z.array(subtitleAssetSchema),
    thumbnails: z.array(thumbnailAssetSchema),
    videos: z.array(videoAssetSchema),
    voices: z.array(voiceAssetSchema)
});

export const SceneSchema = z.object({
    durationMs: timeMsSchema,
    goal: z.string().min(1),
    id: idSchema,
    index: z.number().int().positive(),
    matchedVideoAssetIds: z.array(idSchema),
    notes: z.string(),
    script: z.string().min(1),
    subtitleIds: z.array(idSchema),
    title: z.string().min(1),
    visualIntent: z.string().min(1),
    voiceAssetId: idSchema
});

export const CanvasConfigSchema = z.object({
    durationMs: timeMsSchema,
    fps: z.number().positive(),
    height: z.number().int().positive(),
    safeArea: safeAreaSchema,
    width: z.number().int().positive()
});

export const ProjectMetadataSchema = z.object({
    createdAt: isoDateSchema,
    id: idSchema,
    sourcePrompt: z.string().min(1),
    title: z.string().min(1),
    updatedAt: isoDateSchema
});

export const RenderConfigSchema = z.object({
    format: z.enum(['mp4']),
    quality: z.enum(['preview', 'final'])
});

export const AgentConversationBlockSchema = z.discriminatedUnion('type', [
    z.object({
        text: z.string().min(1),
        type: z.literal('heading')
    }),
    z.object({
        text: z.string().min(1),
        type: z.literal('paragraph')
    }),
    z.object({
        items: z.array(z.string().min(1)),
        type: z.literal('bullets')
    }),
    z.object({
        items: z.array(
            z.object({
                key: z.string().min(1),
                value: z.string().min(1)
            })
        ),
        type: z.literal('key-values')
    }),
    z.object({
        columns: z.array(z.string().min(1)),
        rows: z.array(z.array(z.string())),
        type: z.literal('table')
    }),
    z.object({
        items: z.array(
            z.object({
                detail: z.string().optional(),
                label: z.string().min(1),
                status: z.enum([
                    'cancelled',
                    'completed',
                    'failed',
                    'running',
                    'waiting'
                ])
            })
        ),
        type: z.literal('progress')
    }),
    z.object({
        assets: z.array(
            z.object({
                assetId: idSchema,
                fileName: z.string().min(1),
                frames: z.array(
                    z.object({
                        dataUrl: z.string().min(1),
                        index: z.number().int().nonnegative(),
                        timestampMs: timeMsSchema
                    })
                ),
                selectedFrameIndex: z.number().int().nonnegative().optional()
            })
        ),
        type: z.literal('keyframes')
    })
]);

export const AgentConversationMessageSchema = z.object({
    blocks: z.array(AgentConversationBlockSchema).optional(),
    content: z.string(),
    createdAt: isoDateSchema,
    nodeName: z.string().min(1).optional(),
    role: z.enum(['assistant', 'system', 'user']),
    sequence: z.number().int().nonnegative(),
    sourceEventType: z.string().min(1).optional(),
    tone: z
        .enum(['cancelled', 'completed', 'failed', 'running', 'waiting'])
        .optional()
});

export const AiRunMetadataSchema = z.object({
    conversation: z.array(AgentConversationMessageSchema).optional(),
    graphVersion: z.string().min(1),
    provider: z.string().min(1),
    runId: idSchema
});

const addIssue = ({
    context,
    message,
    path
}: {
    context: z.RefinementCtx;
    message: string;
    path: (number | string)[];
}) => {
    context.addIssue({
        code: z.ZodIssueCode.custom,
        message,
        path
    });
};

export const VideoProjectSchema = z
    .object({
        ai: AiRunMetadataSchema,
        assets: ProjectAssetsSchema,
        canvas: CanvasConfigSchema,
        project: ProjectMetadataSchema,
        render: RenderConfigSchema,
        scenes: z.array(SceneSchema),
        schemaVersion: z.literal('1.0.0'),
        tracks: z.array(TimelineTrackSchema)
    })
    .superRefine((project, context) => {
        const videoAssetIds = new Set(
            project.assets.videos.map((asset) => asset.id)
        );
        const voiceAssetIds = new Set(
            project.assets.voices.map((asset) => asset.id)
        );
        const musicAssetIds = new Set(
            project.assets.music.map((asset) => asset.id)
        );
        const subtitleAssetIds = new Set(
            project.assets.subtitles.map((asset) => asset.id)
        );

        project.tracks.forEach((track, trackIndex) => {
            track.clips.forEach((clip, clipIndex) => {
                const clipPath = ['tracks', trackIndex, 'clips', clipIndex];

                if (clip.endMs <= clip.startMs) {
                    addIssue({
                        context,
                        message: 'Clip endMs must be greater than startMs',
                        path: [...clipPath, 'endMs']
                    });
                }

                if (clip.kind !== track.kind) {
                    addIssue({
                        context,
                        message: `Track ${track.kind} contains invalid clip kind ${clip.kind}`,
                        path: [...clipPath, 'kind']
                    });
                }

                if (clip.kind === 'video' && !videoAssetIds.has(clip.assetId)) {
                    addIssue({
                        context,
                        message: `Video clip references missing asset ${clip.assetId}`,
                        path: [...clipPath, 'assetId']
                    });
                }

                if (clip.kind === 'voice' && !voiceAssetIds.has(clip.assetId)) {
                    addIssue({
                        context,
                        message: `Voice clip references missing asset ${clip.assetId}`,
                        path: [...clipPath, 'assetId']
                    });
                }

                if (
                    clip.kind === 'subtitle' &&
                    !subtitleAssetIds.has(clip.subtitleId)
                ) {
                    addIssue({
                        context,
                        message: `Subtitle clip references missing subtitle ${clip.subtitleId}`,
                        path: [...clipPath, 'subtitleId']
                    });
                }

                if (clip.kind === 'music' && !musicAssetIds.has(clip.assetId)) {
                    addIssue({
                        context,
                        message: `Music clip references missing asset ${clip.assetId}`,
                        path: [...clipPath, 'assetId']
                    });
                }
            });
        });
    });
