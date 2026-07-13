/* eslint-disable no-console */
/**
 * MiniMax-M3 多模态 probe —— 验证 OpenAI 兼容 chat/completions。
 *
 * 协议:OpenAI Chat Completions(/v1/chat/completions)
 * - 图片在 messages[].content[].image_url.url 字段(嵌套,不是顶层)
 * - 支持 detail: 'low' | 'default' | 'high'
 * - 多图:content 数组追加多个 image_url 块
 *
 * 端点:https://api.minimaxi.com/v1/chat/completions
 * 模型:MiniMax-M3(原生多模态,1M context)
 *
 * 跑法:pnpm --filter @miaoma-magicut/desktop probe:m3
 *       pnpm probe:m3 -- /path/to/image.jpg [prompt]
 */

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { config as loadDotenv } from 'dotenv';

const __dirname = dirname(fileURLToPath(import.meta.url));

loadDotenv({ path: resolve(__dirname, '../../../../.env.local') });

const log = (...args: unknown[]) =>
    console.log(`[probe:m3 ${new Date().toISOString()}]`, ...args);

type ChatMessageContentPart =
    | { type: 'text'; text: string }
    | {
          type: 'image_url';
          image_url: { detail?: 'low' | 'default' | 'high'; url: string };
      };

type ChatMessage = {
    content: string | ChatMessageContentPart[];
    role: 'system' | 'user' | 'assistant';
};

type ChatCompletionResponse = {
    choices?: {
        finish_reason?: string;
        index: number;
        message: { content?: string; role?: string };
    }[];
    error?: { code?: string; message: string; type?: string };
    model?: string;
    usage?: {
        completion_tokens?: number;
        prompt_tokens?: number;
        total_tokens?: number;
    };
};

const requireEnv = (key: string): string => {
    const value = process.env[key];
    if (!value) {
        throw new Error(`Missing env ${key} in .env.local`);
    }
    return value;
};

const buildImageDataUrl = (imagePath: string): string => {
    const buffer = readFileSync(imagePath);
    const base64 = buffer.toString('base64');
    const ext = imagePath.toLowerCase().split('.').pop();
    const mime =
        ext === 'jpg' || ext === 'jpeg'
            ? 'image/jpeg'
            : ext === 'gif'
              ? 'image/gif'
              : ext === 'webp'
                ? 'image/webp'
                : 'image/png';
    return `data:${mime};base64,${base64}`;
};

const callChatCompletions = async ({
    apiKey,
    baseUrl,
    messages,
    maxTokens,
    model
}: {
    apiKey: string;
    baseUrl: string;
    maxTokens: number;
    messages: ChatMessage[];
    model: string;
}): Promise<ChatCompletionResponse> => {
    const url = `${baseUrl.replace(/\/$/, '')}/chat/completions`;
    const response = await fetch(url, {
        body: JSON.stringify({
            max_tokens: maxTokens,
            messages,
            model,
            stream: false
        }),
        headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
        },
        method: 'POST'
    });

    const text = await response.text();
    if (!response.ok) {
        throw new Error(
            `M3 chat completions ${response.status}: ${text.slice(0, 500)}`
        );
    }
    return JSON.parse(text) as ChatCompletionResponse;
};

type ProbeInput = {
    detail?: 'low' | 'default' | 'high';
    imagePath: string;
    prompt: string;
};

export const probeMiniMaxMultimodal = async ({
    detail = 'default',
    imagePath,
    prompt
}: ProbeInput): Promise<void> => {
    const apiKey = requireEnv('API_KEY');
    const baseUrl = requireEnv('BASE_URL');
    const model = requireEnv('LLM_MODEL');

    log('provider.configured', { baseUrl, model, detail });

    log('loading image', imagePath);
    const imageUrl = buildImageDataUrl(imagePath);
    log('image data url length', imageUrl.length);

    const messages: ChatMessage[] = [
        {
            content: [
                { text: prompt, type: 'text' },
                {
                    image_url: { detail, url: imageUrl },
                    type: 'image_url'
                }
            ],
            role: 'user'
        }
    ];

    log('invoking chat/completions (multimodal)...');
    const result = await callChatCompletions({
        apiKey,
        baseUrl,
        maxTokens: 512,
        messages,
        model
    });

    if (result.error) {
        throw new Error(
            `M3 returned error: ${result.error.type ?? 'unknown'} - ${result.error.message}`
        );
    }

    const choice = result.choices?.[0];
    const text = choice?.message?.content ?? '';
    log('M3 responded', {
        finishReason: choice?.finish_reason,
        length: text.length,
        model: result.model,
        promptTokens: result.usage?.prompt_tokens,
        completionTokens: result.usage?.completion_tokens,
        totalTokens: result.usage?.total_tokens
    });
    console.log('\n=== M3 response ===');
    console.log(text);
    console.log('=== end ===\n');

    if (!text || text.length < 5) {
        throw new Error('M3 returned empty or too-short content');
    }

    log('✅ multimodal probe PASSED');
};

// CLI 入口
if (process.argv[1] === fileURLToPath(import.meta.url)) {
    const imagePath = process.argv[2] ?? '';
    const prompt =
        process.argv[3] ??
        '请用一段简洁的中文(不超过 80 字)描述这张图片的内容、场景、氛围与可能的拍摄意图。';
    const detail = (process.argv[4] as 'low' | 'default' | 'high') ?? 'default';

    if (!imagePath) {
        console.error(
            '[probe:m3] usage: tsx probe-minimax-m3.ts <image-path> [prompt] [detail]'
        );
        process.exitCode = 2;
    } else {
        probeMiniMaxMultimodal({ detail, imagePath, prompt }).catch(
            (err: unknown) => {
                console.error('[probe:m3] ❌ FAILED', err);
                process.exitCode = 1;
            }
        );
    }
}
