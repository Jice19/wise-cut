/* */
import { z } from 'zod';

export const DescribedImageSchema = z.object({
    actions: z.array(z.string().min(1)).min(1),
    description: z.string().min(5),
    mood: z.string().min(1),
    objects: z.array(z.string().min(1)).min(1),
    promptMatchReason: z.string().min(5),
    promptMatchScore: z.number().min(0).max(1),
    suggestedSceneType: z.string().min(1)
});

export type DescribedImage = z.infer<typeof DescribedImageSchema>;

export const buildDescribeImagesPrompt = ({
    frameCount,
    userPrompt
}: {
    frameCount: number;
    userPrompt: string;
}): string =>
    [
        `你是智剪 Magicut 的视频画面理解专家。`,
        `下方给你 ${frameCount} 张从同一段本地视频里按时间均匀抽出的关键帧，代表这段视频的主要内容。`,
        '',
        '任务:',
        '1. 综合所有帧的画面内容,输出一句话描述(15-30 字),说明这段视频实际在讲什么。',
        '2. 给出整体氛围/调性(5-10 字,例如"专注专业""轻松日常""紧张刺激")。',
        '3. 列出关键物体(屏幕、键盘、人物、车辆等)和关键动作(打字、走路、讲话)。',
        '4. 根据实际内容,建议这段素材适合做哪种分镜(教程演示/口播讲解/剧情演绎/产品展示 等)。',
        '5. 对照用户最终想做的视频主题,给出 0-1 的匹配度 + 20-40 字的解释(为什么合适 / 哪里有 gap)。',
        '',
        '严格 JSON,不要包含 Markdown。字段:',
        '{ "description", "mood", "objects": [...], "actions": [...],',
        '  "suggestedSceneType", "promptMatchScore": 0.x, "promptMatchReason" }',
        '',
        `用户最终想做的视频主题: ${userPrompt}`
    ].join('\n');
