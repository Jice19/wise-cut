/**
 * 视频项目的字段约束 —— Zod schema 事实上的契约源头。
 *
 * 范围:Phase 3 commit 7 落地完整 17 类。
 *   - 基础 5 类(RenderConfig / MediaMetadata / ExtractedKeyframe /
 *     FrameDescription / AssetAnalysis)—— Phase 2 commit 2 已存在
 *   - 12 类新增:
 *       VideoClip / VoiceClip / SubtitleClip / MusicClip / TimelineClip(discriminatedUnion)
 *       TimelineTrack / TimelineTrackKind / ProjectAssets
 *       Scene(扩字段:order / narration / visualBrief / subtitleLines /
 *             matchedAssetId / qualityScore)
 *       CanvasConfig / ProjectMetadata
 *       AgentConversationBlock(5 种渲染块 union) / AgentConversationMessage
 *       AiRunMetadata / CreativeBrief / AssetMatchResult / VoiceSynthesisResult
 *       VideoProject(顶层,带 schemaVersion + superRefine)
 *
 * superRefine 校验两条硬约束:
 *   1. track.clips.assetId 必须都在 assets.videos / voices / music 引用集里
 *   2. 每个 clip.endMs > startMs
 */

import { z } from 'zod';

export const RenderQualitySchema = z.enum(['preview', 'final']);

export const RenderConfigSchema = z.object({
    format: z.literal('mp4'),
    quality: RenderQualitySchema
});

export const MediaMetadataSchema = z.object({
    codecName: z.string(),
    durationMs: z.number().int().nonnegative(),
    filePath: z.string().min(1),
    fps: z.number().nonnegative(),
    hasAudio: z.boolean(),
    height: z.number().int().positive(),
    width: z.number().int().positive()
});

export const ExtractedKeyframeSchema = z.object({
    height: z.number().int().positive(),
    index: z.number().int().nonnegative(),
    path: z.string().min(1),
    timestampMs: z.number().int().nonnegative(),
    width: z.number().int().positive()
});

export const FrameDescriptionSchema = z.object({
    actions: z.array(z.string()),
    description: z.string().min(1),
    frameId: z.string().min(1),
    mood: z.string(),
    objects: z.array(z.string())
});

export const AssetFrameAnalysisSchema = z.object({
    description: z.string(),
    frameId: z.string().min(1),
    mood: z.string(),
    objects: z.array(z.string()),
    timestampMs: z.number().int().nonnegative()
});

export const AssetAnalysisSchema = z.object({
    assetId: z.string().min(1),
    description: z.string(),
    durationMs: z.number().int().nonnegative(),
    filePath: z.string().min(1),
    fps: z.number().nonnegative(),
    frames: z.array(AssetFrameAnalysisSchema),
    /**
     * 0 表示降级(plan §2.5:抽帧或探测失败时允许 frames: [],width/height 也未测量)。
     */
    height: z.number().int().nonnegative(),
    width: z.number().int().nonnegative()
});

// ---------------------------------------------------------------------------
// Phase 3 commit 7 新增 —— 12 类
// ---------------------------------------------------------------------------

/**
 * CreativeBrief —— creative_brief 节点的产出。
 * 纯文本元信息,LLM 从 brief + assets 生成。
 */
export const CreativeBriefSchema = z.object({
    audience: z.string().min(1),
    keyMessages: z.array(z.string().min(1)).min(1),
    summary: z.string().min(1),
    title: z.string().min(1),
    tone: z.string().min(1)
});

/**
 * SubtitleLine —— scene 内的 TTS 字幕分段,scene-planner prompt 强约束
 * 单段不超过 25 CN 字,标点密度 4-7/100 字。
 */
export const SubtitleLineSchema = z.object({
    endMs: z.number().int().positive(),
    startMs: z.number().int().nonnegative(),
    text: z.string().min(1)
});

/**
 * Scene —— plan_scenes 节点产出,后续 match_assets 写 matchedAssetId。
 */
export const SceneSchema = z.object({
    endMs: z.number().int().positive(),
    matchedAssetId: z.string().min(1).optional(),
    narration: z.string().min(1),
    order: z.number().int().nonnegative(),
    qualityScore: z.number().min(0).max(1).optional(),
    sceneId: z.string().min(1),
    startMs: z.number().int().nonnegative(),
    subtitleLines: z.array(SubtitleLineSchema),
    visualBrief: z.string().min(1)
});

/**
 * AssetMatchResult —— match_assets 节点产出。
 * 每个 scene 对应一个:matchedAssetId + 候选 ranking + LLM 评分。
 */
export const AssetMatchResultSchema = z.object({
    matchedAssetId: z.string().min(1),
    ranking: z.number().int().nonnegative(),
    sceneId: z.string().min(1),
    score: z.number().min(0).max(1)
});

/**
 * VoiceSynthesisResult —— synthesize_voice 节点产出。
 * 路径落在临时目录(commit 6 起由 voice-defaults 决定)。
 */
export const WordTimestampSchema = z.object({
    endMs: z.number().int().nonnegative(),
    startMs: z.number().int().nonnegative(),
    word: z.string().min(1)
});

export const VoiceSynthesisResultSchema = z.object({
    audioFilePath: z.string().min(1),
    durationMs: z.number().int().positive(),
    sceneId: z.string().min(1),
    srtPath: z.string().min(1).optional(),
    voiceId: z.string().min(1),
    wordTimestamps: z.array(WordTimestampSchema).optional()
});

// ----- Clip -----

const ClipBaseFields = {
    assetId: z.string().min(1),
    endMs: z.number().int().positive(),
    startMs: z.number().int().nonnegative()
};

export const VideoClipSchema = z.object({
    ...ClipBaseFields,
    kind: z.literal('video'),
    /** 播放速率,1.0 = 原速 */
    playbackRate: z.number().positive().default(1)
});

export const VoiceClipSchema = z.object({
    ...ClipBaseFields,
    /** dB 增益,0 = 不变 */
    gainDb: z.number(),
    kind: z.literal('voice')
});

export const SubtitleClipSchema = z.object({
    ...ClipBaseFields,
    fontSizePx: z.number().int().positive(),
    kind: z.literal('subtitle'),
    text: z.string().min(1)
});

export const MusicClipSchema = z.object({
    ...ClipBaseFields,
    gainDb: z.number(),
    kind: z.literal('music'),
    loop: z.boolean().default(false)
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
    kind: TimelineTrackKindSchema,
    trackId: z.string().min(1)
});

// ----- Canvas / Metadata -----

export const CanvasSafeAreaSchema = z.object({
    bottomPx: z.number().int().nonnegative(),
    leftPx: z.number().int().nonnegative(),
    rightPx: z.number().int().nonnegative(),
    topPx: z.number().int().nonnegative()
});

export const CanvasConfigSchema = z.object({
    durationMs: z.number().int().positive(),
    fps: z.number().positive(),
    height: z.number().int().positive(),
    safeArea: CanvasSafeAreaSchema,
    width: z.number().int().positive()
});

export const ProjectMetadataSchema = z.object({
    createdAt: z.string().datetime(),
    projectId: z.string().min(1),
    title: z.string().min(1),
    updatedAt: z.string().datetime()
});

// ----- Assets -----

/**
 * 单个 asset 在 VideoProject 内的引用形态 —— assetId 是 video-agent
 * 阶段产出的 ID,filePath/durationMs 是冗余字段方便 renderer 即时
 * 渲染(不需要再回查 video-agent)。
 */
export const ProjectAssetSchema = z.object({
    assetId: z.string().min(1),
    durationMs: z.number().int().nonnegative(),
    filePath: z.string().min(1),
    kind: z.enum(['video', 'voice', 'music'])
});

/**
 * commit 15 — 单个时间窗的帧分组摘要。
 * (放在前面,AgentConversationAnalysisBlockSchema 引用)
 */
export const KeyFrameWindowAnalysisSchema = z.object({
    frameIds: z.array(z.string().min(1)),
    summary: z.string().min(1),
    windowEnd: z.number().int().nonnegative(),
    windowIndex: z.number().int().nonnegative(),
    windowStart: z.number().int().nonnegative()
});

/**
 * commit 15 — 帧分组分析整体结果(由 LLM 产出,assemble_timeline 写进 project)。
 */
export const VideoAnalysisResultSchema = z.object({
    keyFrameAnalysis: z.array(KeyFrameWindowAnalysisSchema),
    overallUnderstanding: z.string().min(1),
    summary: z.string().min(1)
});

export const ProjectAssetsSchema = z.object({
    music: z.array(ProjectAssetSchema),
    videos: z.array(ProjectAssetSchema),
    voices: z.array(ProjectAssetSchema)
});

// ----- Agent 对话历史 -----

export const AgentConversationTextBlockSchema = z.object({
    kind: z.literal('text'),
    text: z.string().min(1)
});

export const AgentConversationScenesBlockSchema = z.object({
    kind: z.literal('scenes'),
    scenes: z.array(SceneSchema)
});

export const AgentConversationApprovalRequestBlockSchema = z.object({
    interruptType: z.string().min(1),
    kind: z.literal('approval_request'),
    payload: z.unknown()
});

export const AgentConversationApprovalResponseBlockSchema = z.object({
    approved: z.boolean(),
    kind: z.literal('approval_response'),
    note: z.string().optional()
});

export const AgentConversationRunSummaryBlockSchema = z.object({
    kind: z.literal('run_summary'),
    runId: z.string().min(1),
    status: z.enum(['completed', 'failed', 'cancelled'])
});

/**
 * commit 15 — 帧分组分析结果(放在 agentConversation 第一条消息,
 * editor 渲染时直接读这个 block 显示整体摘要 + 窗分析)
 */
export const AgentConversationAnalysisBlockSchema = z.object({
    analysis: VideoAnalysisResultSchema,
    kind: z.literal('analysis')
});

export const AgentConversationBlockSchema = z.discriminatedUnion('kind', [
    AgentConversationTextBlockSchema,
    AgentConversationScenesBlockSchema,
    AgentConversationApprovalRequestBlockSchema,
    AgentConversationApprovalResponseBlockSchema,
    AgentConversationRunSummaryBlockSchema,
    AgentConversationAnalysisBlockSchema
]);

export const AgentConversationMessageSchema = z.object({
    blocks: z.array(AgentConversationBlockSchema),
    createdAtMs: z.number().int().nonnegative(),
    role: z.enum(['assistant', 'user'])
});

// ----- AiRunMetadata -----

export const AiRunMetadataSchema = z.object({
    analysisResult: VideoAnalysisResultSchema.optional(),
    brief: CreativeBriefSchema,
    runId: z.string().min(1),
    scenes: z.array(SceneSchema)
});

// ----- 顶层 VideoProject -----

export const VIDEO_PROJECT_SCHEMA_VERSION = '1.0.0' as const;

export const VideoProjectSchema = z
    .object({
        agentConversation: z.array(AgentConversationMessageSchema),
        assets: ProjectAssetsSchema,
        canvas: CanvasConfigSchema,
        metadata: ProjectMetadataSchema,
        renderConfig: RenderConfigSchema,
        schemaVersion: z.literal(VIDEO_PROJECT_SCHEMA_VERSION),
        tracks: z.array(TimelineTrackSchema)
    })
    .superRefine((project, ctx) => {
        const knownAssetIds = new Set<string>([
            ...project.assets.videos.map((a) => a.assetId),
            ...project.assets.voices.map((a) => a.assetId),
            ...project.assets.music.map((a) => a.assetId)
        ]);

        for (const track of project.tracks) {
            for (let i = 0; i < track.clips.length; i += 1) {
                const clip = track.clips[i]!;
                const clipPath = `tracks[?].clips[${i}]`;

                // 1. assetId 引用闭合
                if (!knownAssetIds.has(clip.assetId)) {
                    ctx.addIssue({
                        code: z.ZodIssueCode.custom,
                        message: `${clipPath}.assetId references unknown asset "${clip.assetId}"`,
                        path: ['tracks']
                    });
                }

                // 2. endMs > startMs
                if (clip.endMs <= clip.startMs) {
                    ctx.addIssue({
                        code: z.ZodIssueCode.custom,
                        message: `${clipPath}.endMs (${clip.endMs}) must be greater than startMs (${clip.startMs})`,
                        path: ['tracks']
                    });
                }
            }
        }
    });

// ----- 类型导出 -----

export type AssetAnalysis = z.infer<typeof AssetAnalysisSchema>;
export type AssetFrameAnalysis = z.infer<typeof AssetFrameAnalysisSchema>;
export type ExtractedKeyframe = z.infer<typeof ExtractedKeyframeSchema>;
export type FrameDescription = z.infer<typeof FrameDescriptionSchema>;
export type MediaMetadata = z.infer<typeof MediaMetadataSchema>;
export type RenderConfig = z.infer<typeof RenderConfigSchema>;
export type RenderQuality = z.infer<typeof RenderQualitySchema>;

export type CreativeBrief = z.infer<typeof CreativeBriefSchema>;
export type SubtitleLine = z.infer<typeof SubtitleLineSchema>;
export type Scene = z.infer<typeof SceneSchema>;
export type AssetMatchResult = z.infer<typeof AssetMatchResultSchema>;
export type VoiceSynthesisResult = z.infer<typeof VoiceSynthesisResultSchema>;
export type WordTimestamp = z.infer<typeof WordTimestampSchema>;

export type VideoClip = z.infer<typeof VideoClipSchema>;
export type VoiceClip = z.infer<typeof VoiceClipSchema>;
export type SubtitleClip = z.infer<typeof SubtitleClipSchema>;
export type MusicClip = z.infer<typeof MusicClipSchema>;
export type TimelineClip = z.infer<typeof TimelineClipSchema>;
export type TimelineTrack = z.infer<typeof TimelineTrackSchema>;
export type TimelineTrackKind = z.infer<typeof TimelineTrackKindSchema>;

export type CanvasSafeArea = z.infer<typeof CanvasSafeAreaSchema>;
export type CanvasConfig = z.infer<typeof CanvasConfigSchema>;
export type ProjectMetadata = z.infer<typeof ProjectMetadataSchema>;

export type ProjectAsset = z.infer<typeof ProjectAssetSchema>;
export type ProjectAssets = z.infer<typeof ProjectAssetsSchema>;

export type AgentConversationBlock = z.infer<
    typeof AgentConversationBlockSchema
>;
export type AgentConversationMessage = z.infer<
    typeof AgentConversationMessageSchema
>;

export type AiRunMetadata = z.infer<typeof AiRunMetadataSchema>;
export type KeyFrameWindowAnalysis = z.infer<
    typeof KeyFrameWindowAnalysisSchema
>;
export type VideoAnalysisResult = z.infer<typeof VideoAnalysisResultSchema>;
export type AgentConversationAnalysisBlock = z.infer<
    typeof AgentConversationAnalysisBlockSchema
>;
export type VideoProject = z.infer<typeof VideoProjectSchema>;
