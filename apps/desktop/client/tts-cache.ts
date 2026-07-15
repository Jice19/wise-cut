/**
 * TTS 缓存层 —— commit 14。
 *
 * 设计:
 *   - 缓存 key = sha1(narration + voiceId)
 *   - 缓存路径 = ~/.miaoma-tts-cache/{hash}.mp3
 *   - 缓存 metadata = ~/.miaoma-tts-cache/{hash}.json
 *     (含 wordTimestamps / createdAt / narration 摘要)
 *
 * 工作流(commit 14.1 集成到 synthesize_voice 节点时):
 *   1. 计算 hash
 *   2. 缓存命中 → 读 mp3 + 读 metadata.json 拿 wordTimestamps
 *   3. 缓存未命中 → 调真 TTS API → 写 mp3 + metadata.json
 *
 * 单测覆盖:
 *   - 同 narration+voiceId → 命中
 *   - 不同 narration → 不命中
 *   - 不同 voiceId → 不命中
 *   - getCachedOrNull 命中返回字级时间戳
 */

import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

import type {
    TtsWriteResult,
    WordTimestamp
} from '@miaoma-magicut/video-agent';

const CACHE_DIR = join(homedir(), '.miaoma-tts-cache');

export type TtsCacheKey = string;

export type TtsCacheMetadata = {
    createdAt: string;
    durationMs: number;
    narration: string;
    voiceId: string;
    wordTimestamps: WordTimestamp[];
};

/**
 * 生成缓存 key —— sha1(narration + voiceId) 前 32 字符。
 * 32 字符 = 128 bit,冲突概率忽略不计。
 */
export const computeTtsCacheKey = (
    narration: string,
    voiceId: string
): TtsCacheKey => {
    const hash = createHash('sha1');
    hash.update(narration);
    hash.update('\x00'); // 分隔符避免 narration="a" + voiceId="bc" 与 "ab" + voiceId="c" 撞
    hash.update(voiceId);
    return hash.digest('hex').slice(0, 32);
};

const cachePath = (key: TtsCacheKey): string => join(CACHE_DIR, `${key}.mp3`);
const metadataPath = (key: TtsCacheKey): string =>
    join(CACHE_DIR, `${key}.json`);

export const ensureTtsCacheDir = async (): Promise<void> => {
    await mkdir(CACHE_DIR, { recursive: true });
};

/**
 * 查缓存 — 命中返回 TtsWriteResult,没命中返回 null。
 * cache miss 时不抛错,让上层去调真 TTS API。
 */
export const getCachedOrNull = async (
    narration: string,
    voiceId: string
): Promise<TtsWriteResult | null> => {
    const key = computeTtsCacheKey(narration, voiceId);
    try {
        const [mp3Buf, metaJson] = await Promise.all([
            readFile(cachePath(key)),
            readFile(metadataPath(key), 'utf-8')
        ]);
        const meta = JSON.parse(metaJson) as TtsCacheMetadata;
        // mp3 写到一个临时路径(避免覆盖 cache 路径)+ 返回给上层
        return {
            audioFilePath: cachePath(key),
            // wordTimestamps 直接从 metadata 拿(避免再次 parse mp3)
            wordTimestamps: meta.wordTimestamps
        };
    } catch {
        return null;
    }
};

/**
 * 写缓存 —— 把 mp3 bytes + wordTimestamps 写到 cache 目录。
 * 上层(commit 14.1 TTS adapter)从真 API 拿到 mp3 buffer + wordTimestamps 后调用。
 */
export const writeTtsCache = async (input: {
    audioBytes: Uint8Array | Buffer;
    durationMs: number;
    narration: string;
    voiceId: string;
    wordTimestamps: WordTimestamp[];
}): Promise<TtsCacheKey> => {
    await ensureTtsCacheDir();
    const key = computeTtsCacheKey(input.narration, input.voiceId);

    const meta: TtsCacheMetadata = {
        createdAt: new Date().toISOString(),
        durationMs: input.durationMs,
        narration: input.narration.slice(0, 100),
        voiceId: input.voiceId,
        wordTimestamps: input.wordTimestamps
    };

    await Promise.all([
        writeFile(cachePath(key), input.audioBytes),
        writeFile(metadataPath(key), JSON.stringify(meta, null, 2), 'utf-8')
    ]);

    return key;
};

/**
 * 清空整个缓存目录 —— 单测 / 调试用。
 */
export const clearTtsCache = async (): Promise<void> => {
    const { rm } = await import('node:fs/promises');
    await rm(CACHE_DIR, { recursive: true, force: true });
};
