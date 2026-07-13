/* eslint-disable no-console */
/**
 * MiniMax-M3 多模态 chat —— 连通性 probe
 *
 * 这个文件只是薄壳:
 *   1. 读 .env.local + CLI 参数(图片路径 + 提示词 + detail)
 *   2. 构造 MinimaxM3ChatProvider
 *   3. 调 chat({ messages: [{ role: 'user', content: [text, image_url] }] })
 *   4. 打印文本响应
 *
 * 真正的 HTTP/SSE/multimodal 序列化逻辑全部在 providers/minimax-m3-chat-provider.ts。
 *
 * 跑法:
 *   pnpm --filter @miaoma-magicut/desktop probe:m3
 *   pnpm --filter @miaoma-magicut/desktop probe:m3 -- /path/to/image.jpg
 *   pnpm --filter @miaoma-magicut/desktop probe:m3 -- /path/to/image.jpg "自定义 prompt"
 *   pnpm --filter @miaoma-magicut/desktop probe:m3 -- image.jpg "prompt" low
 */

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { config as loadDotenv } from 'dotenv';

import {
    type ChatMessage,
    MinimaxM3ChatProvider
} from './providers/minimax-m3-chat-provider';

const __dirname = dirname(fileURLToPath(import.meta.url));

loadDotenv({ path: resolve(__dirname, '../../../../.env.local') });

const log = (...args: unknown[]) =>
    console.log(`[probe:m3 ${new Date().toISOString()}]`, ...args);

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

const DEFAULT_PROMPT =
    '请用一段简洁的中文(不超过 80 字)描述这张图片的内容、场景、氛围与可能的拍摄意图。';
const DEFAULT_DETAIL: 'low' | 'default' | 'high' = 'default';

export const probeMinimaxM3Multimodal = async ({
    detail = DEFAULT_DETAIL,
    imagePath,
    prompt = DEFAULT_PROMPT
}: {
    detail?: 'low' | 'default' | 'high';
    imagePath: string;
    prompt?: string;
}): Promise<void> => {
    const apiKey = requireEnv('API_KEY');
    const baseUrl = requireEnv('BASE_URL');
    const model = requireEnv('LLM_MODEL');

    log('provider.configured', { baseUrl, detail, model });

    log('loading image', imagePath);
    const imageUrl = buildImageDataUrl(imagePath);
    log('image data url length', imageUrl.length);

    const messages: ChatMessage[] = [
        {
            content: [
                { text: prompt, type: 'text' },
                { image_url: { detail, url: imageUrl }, type: 'image_url' }
            ],
            role: 'user'
        }
    ];

    const provider = new MinimaxM3ChatProvider({ apiKey, baseUrl, model });

    log('invoking chat/completions (multimodal)...');
    const text = await provider.chat({ maxTokens: 512, messages });

    log('M3 responded', { length: text.length });
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
    const prompt = process.argv[3] ?? DEFAULT_PROMPT;
    const detail =
        (process.argv[4] as 'low' | 'default' | 'high') ?? DEFAULT_DETAIL;

    if (!imagePath) {
        console.error(
            '[probe:m3] usage: tsx probe-minimax-m3.ts <image-path> [prompt] [detail]'
        );
        process.exitCode = 2;
    } else {
        probeMinimaxM3Multimodal({ detail, imagePath, prompt }).catch(
            (err: unknown) => {
                console.error('[probe:m3] ❌ FAILED', err);
                process.exitCode = 1;
            }
        );
    }
}
