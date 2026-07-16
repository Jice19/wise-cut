/* */
import { z } from 'zod';

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
};

export const buildCreativeBriefPrompt = ({
    prompt,
    sourceAssetSummaries
}: CreativeBriefInput): string =>
    [
        '你是智剪的视频创意策划智能体。',
        '根据用户提示词和本地素材摘要，输出严格 JSON，不要包含 Markdown。',
        'JSON 字段：title, summary, audience, tone, visualStyle, keyMessages。',
        `用户提示词：${prompt}`,
        `本地素材摘要：${sourceAssetSummaries.join('；') || '暂无'}`
    ].join('\n');
