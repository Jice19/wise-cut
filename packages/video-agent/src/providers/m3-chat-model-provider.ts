/**
 * M3 多模态 ModelProvider 实现 —— 包了 probe 层的 MinimaxM3ChatProvider。
 *
 * 关键点(plan §2.4):
 *   - base64 data URL 发到 image_url.url(M3 看得到,不是 imagePath)
 *   - prompt 显式禁止 Markdown 包裹 JSON,保证 .parse 不被 ``` 包裹打断
 *   - 解析后逐项 FrameDescriptionSchema.parse,任一失败抛 FrameDescriptionSchemaError
 *
 * 用法:
 *   const provider = new MinimaxM3ModelProvider({ apiKey });
 *   await provider.describeFrames({ frames: [{ frameId, base64DataUrl, mimeType }] });
 */

import { z } from 'zod';

import {
    type ChatContentPart,
    type ChatMessage,
    MinimaxM3ChatProvider
} from '../../../../apps/desktop/scripts/api-probe/providers/minimax-m3-chat-provider.ts';
import {
    type FrameDescription,
    FrameDescriptionSchema
} from '../../../video-project/src/index.ts';
import {
    buildFrameIdList,
    FRAME_DESCRIPTION_SYSTEM_PROMPT,
    FRAME_DESCRIPTION_USER_PROMPT_TEMPLATE
} from '../prompts/frame-description.ts';
import { extractJsonFromLlmResponse } from './llm-json.ts';
import type {
    DescribeFramesInput,
    FrameImage,
    GenerateTextInput,
    GenerateTextResult,
    ModelProvider
} from './model-provider.ts';

export class FrameDescriptionSchemaError extends Error {
    constructor(
        message: string,
        readonly options: {
            cause?: unknown;
            frameId?: string;
            issues?: z.ZodIssue[];
        } = {}
    ) {
        super(message);
        this.name = 'FrameDescriptionSchemaError';
    }
}

const WrappedResponseSchema = z.object({
    frames: z.array(
        z.object({
            actions: z.array(z.string()),
            description: z.string(),
            frameId: z.string().min(1),
            mood: z.string(),
            objects: z.array(z.string())
        })
    )
});

export type MinimaxM3ModelProviderOptions = {
    apiKey: string;
    baseUrl?: string;
    maxTokens?: number;
    model?: string;
    /**
     * 注入点 —— 单测时塞 stub。生产用默认的 MinimaxM3ChatProvider。
     */
    m3ChatProvider?: MinimaxM3ChatProvider;
    temperature?: number;
    timeoutMs?: number;
};

export class MinimaxM3ModelProvider implements ModelProvider {
    private readonly chat: MinimaxM3ChatProvider;
    private readonly maxTokens: number;
    private readonly temperature: number;

    constructor(options: MinimaxM3ModelProviderOptions) {
        this.chat =
            options.m3ChatProvider ??
            new MinimaxM3ChatProvider({
                apiKey: options.apiKey,
                baseUrl: options.baseUrl,
                model: options.model,
                timeoutMs: options.timeoutMs
            });
        this.maxTokens = options.maxTokens ?? 1024;
        this.temperature = options.temperature ?? 0.4;
    }

    async describeFrames({
        frames,
        maxTokens,
        temperature
    }: DescribeFramesInput): Promise<FrameDescription[]> {
        if (frames.length === 0) {
            return [];
        }

        const userContent: ChatContentPart[] = [
            { text: FRAME_DESCRIPTION_USER_PROMPT_TEMPLATE, type: 'text' },
            {
                text: buildFrameIdList(
                    frames.map((f: FrameImage) => f.frameId)
                ),
                type: 'text'
            },
            ...frames.map<ChatContentPart>((f) => ({
                image_url: { url: f.base64DataUrl },
                type: 'image_url'
            }))
        ];

        const messages: ChatMessage[] = [
            {
                content: FRAME_DESCRIPTION_SYSTEM_PROMPT,
                role: 'system'
            },
            { content: userContent, role: 'user' }
        ];

        const text = await this.chat.chat({
            maxTokens: maxTokens ?? this.maxTokens,
            messages,
            temperature: temperature ?? this.temperature
        });

        let rawJson: unknown;
        try {
            rawJson = extractJsonFromLlmResponse(text);
        } catch (error) {
            throw new FrameDescriptionSchemaError((error as Error).message, {
                cause: error
            });
        }

        const parsed = WrappedResponseSchema.safeParse(rawJson);

        if (!parsed.success) {
            throw new FrameDescriptionSchemaError(
                `LLM response failed schema validation: ${parsed.error.message}`,
                { issues: parsed.error.issues }
            );
        }

        // 校验 frameId 顺序与输入一致 + 逐项 FrameDescriptionSchema.parse
        const inputIds = frames.map((f) => f.frameId);
        const outputIds = parsed.data.frames.map((f) => f.frameId);

        if (
            outputIds.length !== inputIds.length ||
            outputIds.some((id, i) => id !== inputIds[i])
        ) {
            throw new FrameDescriptionSchemaError(
                `Frame id mismatch: expected ${JSON.stringify(inputIds)}, got ${JSON.stringify(outputIds)}`
            );
        }

        return parsed.data.frames.map((frame) =>
            FrameDescriptionSchema.parse(frame)
        );
    }

    /**
     * 纯文本生成 —— creative_brief / plan_scenes / match_assets 节点用。
     * 返回原始文本,调用方用 extractJsonFromLlmResponse 抠 JSON。
     */
    async generateText({
        system,
        user,
        maxTokens,
        temperature
    }: GenerateTextInput): Promise<GenerateTextResult> {
        const messages: ChatMessage[] = [
            { content: system, role: 'system' },
            { content: user, role: 'user' }
        ];

        const text = await this.chat.chat({
            maxTokens: maxTokens ?? this.maxTokens,
            messages,
            temperature: temperature ?? this.temperature
        });

        return { text };
    }
}
