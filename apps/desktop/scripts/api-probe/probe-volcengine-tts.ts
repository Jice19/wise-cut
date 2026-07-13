/* eslint-disable no-console */
/**
 * 火山方舟 Agent Plan TTS —— 连通性 probe
 *
 * 这个文件只是薄壳:
 *   1. 读 .env.local + CLI 参数
 *   2. 构造 VolcengineTtsProvider
 *   3. 调 synthesizeSpeech({ text, outputPath })
 *   4. 打印结果
 *
 * 真正的协议/字节/握手逻辑全部在 providers/volcengine-tts-provider.ts + tts-protocol/。
 *
 * 跑法:
 *   pnpm --filter @miaoma-magicut/desktop probe:tts
 *   pnpm --filter @miaoma-magicut/desktop probe:tts -- "文本内容"
 *   pnpm --filter @miaoma-magicut/desktop probe:tts -- "文本" "speaker"
 */

import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { config as loadDotenv } from 'dotenv';

import { VolcengineTtsProvider } from './providers/volcengine-tts-provider';

const __dirname = dirname(fileURLToPath(import.meta.url));

loadDotenv({ path: resolve(__dirname, '../../../../.env.local') });

const log = (...args: unknown[]) =>
    console.log(`[probe:tts ${new Date().toISOString()}]`, ...args);

const requireEnv = (key: string): string => {
    const value = process.env[key];
    if (!value) {
        throw new Error(`Missing env ${key} in .env.local`);
    }
    return value;
};

const DEFAULT_SPEAKER = 'zh_female_gaolengyujie_uranus_bigtts';
const DEFAULT_TEXT = '你好，欢迎使用语音合成服务。';

export const probeVolcengineTts = async ({
    text,
    voice
}: {
    text?: string;
    voice?: string;
}): Promise<void> => {
    const apiKey = requireEnv('VOLCENGINE_TTS_API_KEY');
    const endpoint = process.env.TTS_BASE_URL;
    const resourceId = process.env.TTS_RESOURCE_ID;
    const speaker = voice ?? DEFAULT_SPEAKER;
    const finalText = text ?? DEFAULT_TEXT;
    const outputPath = resolve(__dirname, '.probe-out/tts.mp3');

    log('tts.configured', {
        endpoint,
        resourceId,
        speaker,
        textLen: finalText.length
    });

    const provider = new VolcengineTtsProvider({
        apiKey,
        endpoint,
        resourceId,
        voice: speaker
    });

    const result = await provider.synthesizeSpeech({
        outputPath,
        text: finalText
    });

    log('✅ TTS probe PASSED', {
        outputPath: result.path,
        bytes: result.byteLength,
        format: result.format
    });
};

// CLI 入口
if (process.argv[1] === fileURLToPath(import.meta.url)) {
    const text = process.argv[2];
    const voice = process.argv[3];
    probeVolcengineTts({ text, voice }).catch((err: unknown) => {
        console.error('[probe:tts] ❌ FAILED', err);
        process.exitCode = 1;
    });
}
