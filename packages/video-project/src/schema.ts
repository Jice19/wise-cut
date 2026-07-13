/**
 * 视频项目的字段约束 —— Zod schema 事实上的契约源头。
 *
 * 范围:本阶段(Phase 2)只描述 `AssetAnalysis` / `FrameDescription` / `MediaMetadata` /
 * `ExtractedKeyframe` / `RenderConfig` 五块。`VideoProject` 顶层结构留到 Phase 3 commit 5 串流水线时再扩。
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

export type AssetAnalysis = z.infer<typeof AssetAnalysisSchema>;
export type AssetFrameAnalysis = z.infer<typeof AssetFrameAnalysisSchema>;
export type ExtractedKeyframe = z.infer<typeof ExtractedKeyframeSchema>;
export type FrameDescription = z.infer<typeof FrameDescriptionSchema>;
export type MediaMetadata = z.infer<typeof MediaMetadataSchema>;
export type RenderConfig = z.infer<typeof RenderConfigSchema>;
export type RenderQuality = z.infer<typeof RenderQualitySchema>;
