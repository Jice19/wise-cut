/* */
import { z } from 'zod';

import type { SourceAssetSummary } from './scene-planner';

export const CreativeBriefSchema = z.object({
    audience: z.string().min(1),
    keyMessages: z.array(z.string().min(1)).min(1),
    summary: z.string().min(1),
    title: z.string().min(1),
    tone: z.string().min(1),
    visualStyle: z.string().min(1)
});

export type CreativeBrief = z.infer<typeof CreativeBriefSchema>;

export type CreativeBriefInput = {
    prompt: string;
    sourceAssetSummaries: string[];
    /**
     * 可选:本地素材的多模态理解详情(Step 2 的 describeImages 输出)。
     * 跟 sourceAssetSummaries 不冲突 — summaries 是粗糙的字符串清单,
     * sourceAssets 是带 mood / suggestedSceneType 等结构的清单,LLM
     * 据此能更准地写 visualStyle / keyMessages。
     */
    sourceAssets?: SourceAssetSummary[];
};

const formatSourceAssetsSection = (
    sourceAssets: SourceAssetSummary[]
) => {
    if (sourceAssets.length === 0) return undefined;

    const lines = sourceAssets.map((asset, index) => {
        const meta: string[] = [`描述:${asset.description}`];

        if (asset.mood) meta.push(`氛围:${asset.mood}`);
        if (asset.suggestedSceneType)
            meta.push(`适合分镜类型:${asset.suggestedSceneType}`);
        if (asset.objects && asset.objects.length > 0)
            meta.push(`关键物体:${asset.objects.join('、')}`);
        if (asset.actions && asset.actions.length > 0)
            meta.push(`关键动作:${asset.actions.join('、')}`);

        return `${index + 1}. 素材[${asset.assetId}] ${meta.join(' | ')}`;
    });

    return [
        '本地素材详情(已经过多模态画面理解,可作为视觉风格 / 受众 / 核心信息提炼的依据):',
        ...lines
    ].join('\n');
};

export const buildCreativeBriefPrompt = ({
    prompt,
    sourceAssetSummaries,
    sourceAssets
}: CreativeBriefInput): string => {
    const sourceAssetsSection = sourceAssets
        ? formatSourceAssetsSection(sourceAssets)
        : undefined;

    return [
        '你是智剪的视频创意策划智能体。',
        '根据用户提示词和本地素材摘要，输出严格 JSON，不要包含 Markdown。',
        'JSON 字段：title, summary, audience, tone, visualStyle, keyMessages。',
        `用户提示词：${prompt}`,
        `本地素材摘要：${sourceAssetSummaries.join('；') || '暂无'}`,
        sourceAssetsSection
    ]
        .filter((line) => line !== undefined)
        .join('\n');
};
