/* */
import { mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { RoutingTtsProvider } from '../src/providers/index-tts2-provider';
import { TtsCacheProvider } from '../src/providers/tts-cache-provider';
import type { TtsProvider } from '../src/providers/tts-provider';

const waitForManifest = () =>
    new Promise((resolve) => {
        setTimeout(resolve, 20);
    });

const createFakeVolcengine = ({
    calls,
    marker
}: {
    calls: string[];
    marker?: string;
}): TtsProvider => ({
    providerName: 'fake-volcengine',
    synthesizeSpeech: async (input) => {
        calls.push(input.text);

        await writeFile(input.outputPath, `${marker ?? ''}${input.text}`);

        return {
            byteLength: Buffer.byteLength(input.text),
            durationMs: 1234,
            format: 'mp3',
            path: input.outputPath
        };
    }
});

const createOutputFile = (dir: string, name: string) => join(dir, name);

// 输出文件放到独立目录,避免干扰「缓存目录里只有缓存产物」的断言。
const createIsolatedOutputDir = () =>
    mkdtemp(join(tmpdir(), 'app-tts-cache-out-'));

describe('TtsCacheProvider', () => {
    it('miss:delegates to inner and persists cache file + manifest', async () => {
        const dir = await mkdtemp(join(tmpdir(), 'app-tts-cache-'));
        const outDir = await createIsolatedOutputDir();
        const calls: string[] = [];
        const provider = new TtsCacheProvider({
            cacheDirectory: dir,
            inner: createFakeVolcengine({ calls })
        });
        const outputPath = createOutputFile(outDir, 'out-1.mp3');

        const result = await provider.synthesizeSpeech({
            outputPath,
            text: '智剪让视频创作更快',
            voice: 'zh_female_wenroushunv_uranus_bigtts'
        });

        expect(calls).toEqual(['智剪让视频创作更快']);
        expect(result).toEqual({
            byteLength: 27,
            durationMs: 1234,
            format: 'mp3',
            path: outputPath
        });
        expect(await readFile(outputPath, 'utf8')).toBe('智剪让视频创作更快');

        await waitForManifest();
        const files = await readdir(dir);

        expect(files).toContain('index.json');
        expect(files.filter((name) => name.endsWith('.mp3'))).toHaveLength(1);
    });

    it('hit:same content does not call inner again and copies bytes to the new output path', async () => {
        const dir = await mkdtemp(join(tmpdir(), 'app-tts-cache-'));
        const outDir = await createIsolatedOutputDir();
        const calls: string[] = [];
        const provider = new TtsCacheProvider({
            cacheDirectory: dir,
            inner: createFakeVolcengine({ calls })
        });
        const firstOutput = createOutputFile(outDir, 'run-a.mp3');
        const secondOutput = createOutputFile(outDir, 'run-b.mp3');

        await provider.synthesizeSpeech({
            outputPath: firstOutput,
            text: '大家好',
            voice: 'zh_female_wenroushunv_uranus_bigtts'
        });

        const second = await provider.synthesizeSpeech({
            outputPath: secondOutput,
            text: '大家好',
            voice: 'zh_female_wenroushunv_uranus_bigtts'
        });

        expect(calls).toEqual(['大家好']); // 第二次没调 inner
        expect(second).toMatchObject({
            byteLength: 9,
            durationMs: 1234,
            format: 'mp3',
            path: secondOutput
        });
        expect(await readFile(secondOutput, 'utf8')).toBe('大家好');
    });

    it('treats text / voice / speed / volume as part of the content hash', async () => {
        const dir = await mkdtemp(join(tmpdir(), 'app-tts-cache-'));
        const outDir = await createIsolatedOutputDir();
        const calls: string[] = [];
        const provider = new TtsCacheProvider({
            cacheDirectory: dir,
            inner: createFakeVolcengine({ calls })
        });
        const synthesize = (name: string, extra: object = {}) =>
            provider.synthesizeSpeech({
                outputPath: createOutputFile(outDir, `${name}.mp3`),
                text: '一样',
                voice: 'zh_female_wenroushunv_uranus_bigtts',
                ...extra
            });

        await synthesize('base');
        await synthesize('speed', { speedRatio: 1.2 });
        await synthesize('volume', { volumeRatio: 0.5 });
        await synthesize('other-voice', {
            voice: 'zh_female_gaolengyujie_uranus_bigtts'
        });
        await synthesize('other-text', { text: '不一样' });

        // 每个不同参数组合都应该是独立 key → 4 次都真实调用
        expect(calls).toEqual(['一样', '一样', '一样', '一样', '不一样']);
    });

    it('LRU:evicts the least recently used entry and removes its file', async () => {
        const dir = await mkdtemp(join(tmpdir(), 'app-tts-cache-'));
        const outDir = await createIsolatedOutputDir();
        const calls: string[] = [];
        const provider = new TtsCacheProvider({
            cacheDirectory: dir,
            inner: createFakeVolcengine({ calls }),
            maxEntries: 1
        });

        await provider.synthesizeSpeech({
            outputPath: createOutputFile(outDir, 'a.mp3'),
            text: '第一条',
            voice: 'v1'
        });
        await provider.synthesizeSpeech({
            outputPath: createOutputFile(outDir, 'b.mp3'),
            text: '第二条',
            voice: 'v1'
        });
        await waitForManifest();

        const audioFiles = (await readdir(dir)).filter((name) =>
            name.endsWith('.mp3')
        );

        // 容量 1:第二条插入时第一条(最久未用)被淘汰并删文件
        expect(audioFiles).toHaveLength(1);

        const manifest = JSON.parse(
            await readFile(join(dir, 'index.json'), 'utf8')
        );

        expect(Object.keys(manifest.entries)).toHaveLength(1);
    });

    it('dedupes concurrent synthesizes of the same content', async () => {
        const dir = await mkdtemp(join(tmpdir(), 'app-tts-cache-'));
        const outDir = await createIsolatedOutputDir();
        const calls: string[] = [];
        const provider = new TtsCacheProvider({
            cacheDirectory: dir,
            inner: createFakeVolcengine({ calls })
        });

        const [first, second] = await Promise.all([
            provider.synthesizeSpeech({
                outputPath: createOutputFile(outDir, 'first.mp3'),
                text: '并发去重',
                voice: 'v1'
            }),
            provider.synthesizeSpeech({
                outputPath: createOutputFile(outDir, 'second.mp3'),
                text: '并发去重',
                voice: 'v1'
            })
        ]);

        expect(calls).toEqual(['并发去重']); // 底层只被调用一次
        expect(await readFile(first.path, 'utf8')).toBe('并发去重');
        expect(await readFile(second.path, 'utf8')).toBe('并发去重');
    });

    it('recovers from a corrupt manifest and still synthesizes', async () => {
        const dir = await mkdtemp(join(tmpdir(), 'app-tts-cache-'));
        const outDir = await createIsolatedOutputDir();
        await writeFile(join(dir, 'index.json'), '{corrupt!!', 'utf8');
        const calls: string[] = [];
        const provider = new TtsCacheProvider({
            cacheDirectory: dir,
            inner: createFakeVolcengine({ calls })
        });

        const result = await provider.synthesizeSpeech({
            outputPath: createOutputFile(outDir, 'out.mp3'),
            text: '损坏后还能合成',
            voice: 'v1'
        });

        expect(calls).toEqual(['损坏后还能合成']);
        expect(await readFile(result.path, 'utf8')).toBe('损坏后还能合成');
    });

    it('restores entries from manifest on a new instance (restart persistence)', async () => {
        const dir = await mkdtemp(join(tmpdir(), 'app-tts-cache-'));
        const outDir = await createIsolatedOutputDir();
        const calls: string[] = [];
        const first = new TtsCacheProvider({
            cacheDirectory: dir,
            inner: createFakeVolcengine({ calls })
        });

        await first.synthesizeSpeech({
            outputPath: createOutputFile(outDir, 'run-a.mp3'),
            text: '重启后命中',
            voice: 'v1'
        });
        await waitForManifest();

        const second = new TtsCacheProvider({
            cacheDirectory: dir,
            inner: createFakeVolcengine({ calls })
        });

        const result = await second.synthesizeSpeech({
            outputPath: createOutputFile(outDir, 'run-b.mp3'),
            text: '重启后命中',
            voice: 'v1'
        });

        expect(calls).toEqual(['重启后命中']); // 新实例从 manifest 命中,未调 inner
        expect(await readFile(result.path, 'utf8')).toBe('重启后命中');
    });

    it('exposes the inner providerName so persisted provider metadata stays correct', async () => {
        const dir = await mkdtemp(join(tmpdir(), 'app-tts-cache-'));
        const provider = new TtsCacheProvider({
            cacheDirectory: dir,
            inner: createFakeVolcengine({ calls: [] })
        });

        expect(provider.providerName).toBe('fake-volcengine');
    });

    it('emits the same tts event shape on cache hits', async () => {
        const dir = await mkdtemp(join(tmpdir(), 'app-tts-cache-'));
        const outDir = await createIsolatedOutputDir();
        const calls: string[] = [];
        const provider = new TtsCacheProvider({
            cacheDirectory: dir,
            inner: createFakeVolcengine({ calls })
        });
        const events: unknown[] = [];

        await provider.synthesizeSpeech({
            outputPath: createOutputFile(outDir, 'first.mp3'),
            text: '事件一致',
            voice: 'v1',
            emit: (event) => events.push(event)
        });
        await provider.synthesizeSpeech({
            outputPath: createOutputFile(outDir, 'second.mp3'),
            text: '事件一致',
            voice: 'v1',
            emit: (event) => events.push(event)
        });

        expect(events).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ type: 'tts.started' }),
                expect.objectContaining({ byteLength: 12, type: 'tts.chunk' }),
                expect.objectContaining({
                    byteLength: 12,
                    durationMs: 1234,
                    type: 'tts.completed'
                })
            ])
        );
    });
});

describe('TtsCacheProvider orphan sweep', () => {
    it('removes cache files missing from the manifest on startup', async () => {
        const dir = await mkdtemp(join(tmpdir(), 'app-tts-cache-'));
        const outDir = await createIsolatedOutputDir();
        const calls: string[] = [];
        const first = new TtsCacheProvider({
            cacheDirectory: dir,
            inner: createFakeVolcengine({ calls })
        });

        await first.synthesizeSpeech({
            outputPath: createOutputFile(outDir, 'a.mp3'),
            text: '保留的缓存',
            voice: 'v1'
        });
        await waitForManifest();

        // 模拟上次运行残留的孤儿文件(manifest 丢失/写入中断)
        const orphanName = `${'a'.repeat(64)}.mp3`;

        await writeFile(join(dir, orphanName), 'orphan-bytes');

        const second = new TtsCacheProvider({
            cacheDirectory: dir,
            inner: createFakeVolcengine({ calls })
        });

        await second.synthesizeSpeech({
            outputPath: createOutputFile(outDir, 'b.mp3'),
            text: '触发一次新合成',
            voice: 'v1'
        });
        await waitForManifest();

        const files = await readdir(dir);

        expect(files.some((name) => name === orphanName)).toBe(false);
        expect(files).toContain('index.json');
    });
});

describe('RoutingTtsProvider + TtsCacheProvider integration', () => {
    it('serves repeated built-in-voice synthesis from the cloud cache', async () => {
        const dir = await mkdtemp(join(tmpdir(), 'app-tts-cache-'));
        const outDir = await createIsolatedOutputDir();
        const calls: string[] = [];
        const volcengine = createFakeVolcengine({ calls });
        const cachedDefault = new TtsCacheProvider({
            cacheDirectory: dir,
            inner: volcengine
        });
        const router = new RoutingTtsProvider({
            customProvider: {
                providerName: 'fake-custom',
                synthesizeSpeech: async () => {
                    throw new Error(
                        'custom provider should not run for built-in voices'
                    );
                }
            },
            defaultProvider: cachedDefault
        });
        const synthesize = (name: string) =>
            router.synthesizeSpeech({
                outputPath: createOutputFile(outDir, name),
                text: '今天教大家做智能剪辑',
                voice: 'zh_female_wenroushunv_uranus_bigtts'
            });

        // 模拟「重新生成口播音轨」跑两遍:同一项目、同一文本、同一内置音色
        await synthesize('a.mp3');
        await synthesize('b.mp3');

        // 第二次必须从缓存命中,底层云端 provider 只被调用一次
        expect(calls).toEqual(['今天教大家做智能剪辑']);
        expect(await readFile(createOutputFile(outDir, 'b.mp3'), 'utf8')).toBe(
            '今天教大家做智能剪辑'
        );
    });
});
