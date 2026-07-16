/* */
import { z } from 'zod';

export const AssetMatchCandidateSchema = z.object({
    assetId: z.string().min(1),
    description: z.string().min(1),
    durationMs: z.number().int().positive()
});

export const RankedAssetSchema = z.object({
    assetId: z.string().min(1),
    reason: z.string().min(1),
    score: z.number().min(0).max(1)
});

export const AssetMatchSchema = z.object({
    rankedAssetIds: z.array(RankedAssetSchema).min(1),
    sceneId: z.string().min(1)
});

export const AssetMatchResponseSchema = z.object({
    matches: z.array(AssetMatchSchema).min(1)
});

export type AssetMatchCandidate = z.infer<typeof AssetMatchCandidateSchema>;
export type AssetMatchRanking = z.infer<typeof AssetMatchSchema>;

export const buildAssetMatcherPrompt = ({
    candidates,
    scenes
}: {
    candidates: AssetMatchCandidate[];
    scenes: unknown[];
}): string =>
    [
        '你是智剪的视频素材匹配智能体。',
        '只允许从候选 assetId 中选择，输出严格 JSON，不要包含 Markdown。',
        'JSON 字段：matches，每项包含 sceneId 和 rankedAssetIds；rankedAssetIds 每项包含 assetId, score, reason。',
        `分镜：${JSON.stringify(scenes)}`,
        `候选素材：${JSON.stringify(candidates)}`
    ].join('\n');
