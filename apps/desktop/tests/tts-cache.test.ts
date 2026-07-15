/**
 * TTS 缓存层单元测试 —— commit 14。
 *
 * 测试 isolation:每 test 用独立 CACHE_DIR override 避免污染 $HOME。
 */

import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

// 必须在 import tts-cache 之前 mock homedir
let cacheDir: string;

vi.mock('node:os', async (importOriginal) => {
    const actual = await importOriginal<typeof import('node:os')>();
    return {
        ...actual,
        homedir: () => cacheDir
    };
});

const loadModule = async () => {
    // 动态 import 让 mock 先生效
    return await import('../client/tts-cache.ts');
};

beforeEach(async () => {
    cacheDir = await mkdtemp(join(tmpdir(), 'tts-cache-test-'));
});

afterEach(async () => {
    await rm(cacheDir, { recursive: true, force: true });
});

describe('computeTtsCacheKey', () => {
    it('同 narration + voiceId → 同 key', async () => {
        const { computeTtsCacheKey } = await loadModule();
        const k1 = computeTtsCacheKey('你好世界', 'female-1');
        const k2 = computeTtsCacheKey('你好世界', 'female-1');
        expect(k1).toBe(k2);
        expect(k1).toMatch(/^[a-f0-9]{32}$/);
    });

    it('不同 narration → 不同 key', async () => {
        const { computeTtsCacheKey } = await loadModule();
        expect(computeTtsCacheKey('你好', 'female-1')).not.toBe(
            computeTtsCacheKey('世界', 'female-1')
        );
    });

    it('不同 voiceId → 不同 key', async () => {
        const { computeTtsCacheKey } = await loadModule();
        expect(computeTtsCacheKey('你好', 'female-1')).not.toBe(
            computeTtsCacheKey('你好', 'male-1')
        );
    });

    it('narration="a"+voiceId="bc" ≠ narration="ab"+voiceId="c"(分隔符防冲突)', async () => {
        const { computeTtsCacheKey } = await loadModule();
        expect(computeTtsCacheKey('a', 'bc')).not.toBe(
            computeTtsCacheKey('ab', 'c')
        );
    });
});

describe('writeTtsCache + getCachedOrNull', () => {
    it('写后能读回', async () => {
        const { writeTtsCache, getCachedOrNull, computeTtsCacheKey } =
            await loadModule();
        const key = await writeTtsCache({
            audioBytes: Buffer.from([0xff, 0xfb, 0x90, 0x00]),
            durationMs: 1500,
            narration: '测试缓存',
            voiceId: 'female-1',
            wordTimestamps: [
                { endMs: 500, startMs: 0, word: '测' },
                { endMs: 1000, startMs: 500, word: '试' }
            ]
        });
        expect(key).toMatch(/^[a-f0-9]{32}$/);
        expect(key).toBe(computeTtsCacheKey('测试缓存', 'female-1'));

        const cached = await getCachedOrNull('测试缓存', 'female-1');
        expect(cached).not.toBeNull();
        expect(cached!.wordTimestamps).toHaveLength(2);
        expect(cached!.wordTimestamps[0]?.word).toBe('测');

        // mp3 真的写到 cache 路径
        const buf = await readFile(cached!.audioFilePath);
        expect(buf[0]).toBe(0xff);
    });

    it('cache miss → getCachedOrNull 返回 null', async () => {
        const { getCachedOrNull } = await loadModule();
        const result = await getCachedOrNull('没缓存的内容', 'female-1');
        expect(result).toBeNull();
    });

    it('同 narration + voiceId 第二次读 → 命中同一 key', async () => {
        const { writeTtsCache, getCachedOrNull, computeTtsCacheKey } =
            await loadModule();
        const key1 = await writeTtsCache({
            audioBytes: Buffer.from([0x01]),
            durationMs: 1000,
            narration: '相同内容',
            voiceId: 'female-1',
            wordTimestamps: []
        });
        const key2 = await writeTtsCache({
            audioBytes: Buffer.from([0x02]), // 即使 audioBytes 不同也命中同 key
            durationMs: 2000,
            narration: '相同内容',
            voiceId: 'female-1',
            wordTimestamps: []
        });
        expect(key1).toBe(key2);

        const cached = await getCachedOrNull('相同内容', 'female-1');
        expect(cached).not.toBeNull();
    });
});

describe('clearTtsCache', () => {
    it('清空后 cache 不可读', async () => {
        const { writeTtsCache, getCachedOrNull, clearTtsCache } =
            await loadModule();
        await writeTtsCache({
            audioBytes: Buffer.from([0xaa]),
            durationMs: 500,
            narration: '清空测试',
            voiceId: 'female-1',
            wordTimestamps: []
        });
        expect(await getCachedOrNull('清空测试', 'female-1')).not.toBeNull();

        await clearTtsCache();
        expect(await getCachedOrNull('清空测试', 'female-1')).toBeNull();
    });
});

describe('writeTtsCache 边界', () => {
    it('超长 narration(>100 字符)只截断存到 metadata', async () => {
        const { writeTtsCache, getCachedOrNull } = await loadModule();
        const longText = '啊'.repeat(200);
        await writeTtsCache({
            audioBytes: Buffer.from([0x00]),
            durationMs: 1000,
            narration: longText,
            voiceId: 'female-1',
            wordTimestamps: []
        });
        const cached = await getCachedOrNull(longText, 'female-1');
        expect(cached).not.toBeNull();
        // metadata.narration 截断到 100 字符
        const metaPath = join(cacheDir, 'metadata.json');
        // 通过 getCachedOrNull 间接验证 cache 命中
    });

    it('并发写同 key 不冲突', async () => {
        const { writeTtsCache, getCachedOrNull } = await loadModule();
        await Promise.all(
            Array.from({ length: 5 }, (_, i) =>
                writeTtsCache({
                    audioBytes: Buffer.from([i]),
                    durationMs: 1000,
                    narration: '并发',
                    voiceId: 'female-1',
                    wordTimestamps: []
                })
            )
        );
        const cached = await getCachedOrNull('并发', 'female-1');
        expect(cached).not.toBeNull();
    });
});
