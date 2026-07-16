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

export type ScenePlanInput = {
    brief: unknown;
    targetSceneCount?: number;
};

export const buildScenePlannerPrompt = ({
    brief,
    targetSceneCount
}: ScenePlanInput): string =>
    [
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
        `创意 brief：${JSON.stringify(brief)}`
    ].join('\n');
