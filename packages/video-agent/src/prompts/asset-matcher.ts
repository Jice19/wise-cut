/* */
import { z } from 'zod';

import type { SourceAssetSummary } from './scene-planner';

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

export type AssetMatchPromptInput = {
    candidates: AssetMatchCandidate[];
    scenes: unknown[];
    /**
     * 可选:候选素材的多模态理解详情。如果提供,LLM 在为分镜匹配素材时
     * 也会参考 mood / suggestedSceneType,而不是只看 description。
     * 例如"口播讲解分镜"应该匹配"专注专业 + 口播讲解" 的素材。
     */
    sourceAssets?: SourceAssetSummary[];
};

const formatSourceAssetsSection = (sourceAssets: SourceAssetSummary[]) => {
    if (sourceAssets.length === 0) return undefined;

    const lines = sourceAssets.map((asset, index) => {
        const meta: string[] = [`描述:${asset.description}`];

        if (asset.mood) meta.push(`氛围:${asset.mood}`);
        if (asset.suggestedSceneType)
            meta.push(`适合分镜类型:${asset.suggestedSceneType}`);

        return `${index + 1}. 素材[${asset.assetId}] ${meta.join(' | ')}`;
    });

    return [
        '候选素材的多模态理解(用作分镜匹配的依据,优先选 mood / 适合分镜类型与分镜 visualIntent 匹配的):',
        ...lines
    ].join('\n');
};

export const buildAssetMatcherPrompt = ({
    candidates,
    scenes,
    sourceAssets
}: AssetMatchPromptInput): string => {
    const sourceAssetsSection = sourceAssets
        ? formatSourceAssetsSection(sourceAssets)
        : undefined;

    return [
        '你是智剪的视频素材匹配智能体。',
        '只允许从候选 assetId 中选择，输出严格 JSON，不要包含 Markdown。',
        'JSON 字段：matches，每项包含 sceneId 和 rankedAssetIds；rankedAssetIds 每项包含 assetId, score, reason。',
        `分镜：${JSON.stringify(scenes)}`,
        `候选素材：${JSON.stringify(candidates)}`,
        sourceAssetsSection
    ]
        .filter((line) => line !== undefined)
        .join('\n');
};
