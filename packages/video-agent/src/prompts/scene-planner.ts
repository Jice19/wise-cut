/* */
import { z } from 'zod';

export const PlannedSceneSchema = z.object({
    durationMs: z.number().int().positive(),
    goal: z.string().min(1),
    id: z.string().min(1),
    index: z.number().int().positive(),
    script: z.string().min(1),
    subtitleLines: z.array(z.string().min(1)).min(1),
    title: z.string().min(1),
    visualIntent: z.string().min(1)
});

export const ScenePlanResponseSchema = z.object({
    scenes: z.array(PlannedSceneSchema).min(1)
});

export type PlannedScene = z.infer<typeof PlannedSceneSchema>;

/**
 * 本地素材的多模态理解摘要(来自 Step 2 的 `describeImages` 输出)。
 * 拼到分镜规划 prompt 里,让 LLM 知道每个素材实际在讲什么、
 * 什么氛围、适合做哪种分镜,从而在拆分镜时把 visualIntent 落到具体素材上。
 */
export type SourceAssetSummary = {
    /** 素材原始 assetId(跟 AssetAnalysis.assetId 对齐) */
    assetId: string;
    /** 一句话画面描述(15-30 字) */
    description: string;
    /** 关键物体(可选,辅助 LLM 判断) */
    objects?: string[];
    /** 关键动作(可选) */
    actions?: string[];
    /** 整体氛围/调性(可选,例如"专注专业""轻松日常") */
    mood?: string;
    /** 适合做哪种分镜(教程/口播/剧情/产品展示 等) */
    suggestedSceneType?: string;
};

export type ScenePlanInput = {
    brief: unknown;
    /**
     * 可选:用户对当前分镜方案的反馈(在 scene_approval reject 时传入)。
     * 提供后,LLM 会基于反馈调整分镜(例如"更短""去掉第 3 个分镜"
     * "把视觉意图落到素材 video_asset_001")。未提供就跟原版一致。
     */
    feedback?: string;
    /**
     * 可选:本地素材的多模态理解摘要列表。如果提供,LLM 拆分镜时会把
     * 视觉意图(`visualIntent`)落到具体素材的画面内容上,而不是凭空写。
     * 没提供就跟原版一致,只靠 brief 拆分镜。
     */
    sourceAssets?: SourceAssetSummary[];
    targetSceneCount?: number;
};

const formatSourceAssetsSection = (sourceAssets: SourceAssetSummary[]) => {
    if (sourceAssets.length === 0) return undefined;

    const lines = sourceAssets.map((asset, index) => {
        const meta: string[] = [`描述:${asset.description}`];

        if (asset.mood) meta.push(`氛围:${asset.mood}`);
        if (asset.suggestedSceneType)
            meta.push(`建议分镜类型:${asset.suggestedSceneType}`);
        if (asset.objects && asset.objects.length > 0)
            meta.push(`物体:${asset.objects.join('、')}`);
        if (asset.actions && asset.actions.length > 0)
            meta.push(`动作:${asset.actions.join('、')}`);

        return `${index + 1}. 素材[${asset.assetId}] ${meta.join(' | ')}`;
    });

    return [
        '可用的本地素材(已经过多模态画面理解,作为分镜视觉意图的参考):',
        ...lines,
        '拆分镜时,请尽量把 visualIntent 写成能匹配上述素材画面内容的描述,而不是脱离素材的抽象镜头术语。',
        '如果素材里没有适合某个分镜的内容,在 visualIntent 里说明需要额外素材,不要硬塞。'
    ].join('\n');
};

export const buildScenePlannerPrompt = ({
    brief,
    feedback,
    sourceAssets,
    targetSceneCount
}: ScenePlanInput): string => {
    const sourceAssetsSection = sourceAssets
        ? formatSourceAssetsSection(sourceAssets)
        : undefined;
    const feedbackSection = feedback
        ? `用户对上一版分镜方案的反馈(请据此调整,如果反馈跟其他规则冲突,以反馈为准):${feedback}`
        : undefined;

    return [
        '你是智剪的视频分镜规划智能体。',
        '根据创意 brief 输出严格 JSON，不要包含 Markdown。',
        'JSON 字段：scenes，每个分镜包含 id, index, title, goal, script, subtitleLines, visualIntent, durationMs。',
        '分镜数量不要固定，要根据内容密度、节奏和可匹配素材自然决定；宁可少而清晰，不要为了凑数量拆碎信息。',
        targetSceneCount
            ? `参考分镜数量：${targetSceneCount}，这只是弱参考，不是硬性数量。`
            : '没有固定目标分镜数量，请自行判断需要多少个分镜。',
        'subtitleLines 必须是可以直接朗读给 TTS 的口播稿，每一项都是自然说给观众听的一句话或短句。',
        '每个分镜通常保留 1 到 3 条 subtitleLines，不要把太多句子塞进同一个分镜。',
        'subtitleLines 必须按自然句号、问号、感叹号、分号或语义停顿断开，不要按固定字数截断句子。',
        '不要写分镜说明、镜头动作、标题、编号、冒号式结构，也不要输出“开场：”“镜头1：”“画面：”这类规划标签。',
        'script 必须等于 subtitleLines 按换行拼接，确保左侧文稿字幕展示、字幕文本和 TTS 输入完全一致。',
        '每个分镜对应一个视频画面，但可以包含多条 subtitleLines；每条 subtitleLines 后续会生成一段独立配音。',
        sourceAssetsSection,
        feedbackSection,
        `创意 brief：${JSON.stringify(brief)}`
    ]
        .filter((line) => line !== undefined)
        .join('\n');
};
