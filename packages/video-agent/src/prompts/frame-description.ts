/* */
import { z } from 'zod';

export const FrameDescriptionInputSchema = z.object({
    frameId: z.string().min(1),
    imagePath: z.string().min(1)
});

export const FrameDescriptionSchema = z.object({
    actions: z.array(z.string().min(1)),
    description: z.string().min(1),
    frameId: z.string().min(1),
    mood: z.string().min(1),
    objects: z.array(z.string().min(1))
});

export const FrameDescriptionResponseSchema = z.object({
    frames: z.array(FrameDescriptionSchema)
});

export type FrameDescription = z.infer<typeof FrameDescriptionSchema>;
export type FrameDescriptionInput = z.infer<typeof FrameDescriptionInputSchema>;

export const buildFrameDescriptionPrompt = ({
    frames
}: {
    frames: FrameDescriptionInput[];
}): string =>
    [
        '你是智剪的视频关键帧理解智能体。',
        '根据关键帧路径摘要输出严格 JSON，不要包含 Markdown。',
        'JSON 字段：frames，每项包含 frameId, description, objects, actions, mood。',
        `关键帧：${JSON.stringify(frames)}`
    ].join('\n');
