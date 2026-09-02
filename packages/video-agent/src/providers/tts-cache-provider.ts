/* */
import { createHash } from 'node:crypto';
import {
    copyFile,
    mkdir,
    readFile,
    readdir,
    rm,
    stat,
    writeFile
} from 'node:fs/promises';
import { join } from 'node:path';

import type {
    TtsProvider,
    TtsSynthesisInput,
    TtsSynthesisResult
} from './tts-provider';

/**
 * TtsCacheProvider —— 给任意 TtsProvider 套一层「内容哈希 + LRU」的磁盘缓存。
 *
 * 核心语义:相同内容的合成请求(音色 + 文本 + 语速 + 音量)只调用一次底层
 * provider,后续命中直接复用缓存音频,大幅降低 API 调用成本、提升重复场景
 * 响应速度。
 *
 * 设计要点:
 * - **内容哈希即缓存键**:sha256(providerName + voice + text + speedRatio +
 *   volumeRatio)。任何参数变化都会生成新 key,不会串音。
 * - **LRU 淘汰**:内存 Map 按访问序维护,超过 `maxEntries` 淘汰最久未用的
 *   条目并删除对应缓存文件;`lastUsedAt` 随 manifest 落盘,重启后 LRU 顺序
 *   可恢复。
 * - **缓存是 best-effort**:缓存读写失败不阻断合成(本地持久化是优化不是
 *   正确性依赖);缓存文件损坏时自动删条目并回退到真实合成。
 * - **并发去重**:同一 key 的并发请求共享一次底层调用,避免重复扣费。
 * - **路径契约**:底层 provider 必须把音频写到 `input.outputPath` 并返回
 *   `path === input.outputPath`(VolcengineTtsProvider 满足此契约)。命中时
 *   缓存把音频复制到本次调用的 outputPath,返回路径与未命中完全一致。
 */
export type TtsCacheProviderOptions = {
    /** 缓存目录(建议 userData 下独立子目录),不存在会自动创建。 */
    cacheDirectory: string;
    /** 被包装的真实 provider(目前接 VolcengineTtsProvider)。 */
    inner: TtsProvider;
    /** LRU 容量上限(条目数),默认 128。 */
    maxEntries?: number;
    /** 时钟注入,测试用。 */
    now?: () => number;
};

type CacheEntry = {
    byteLength: number;
    durationMs: number;
    format: 'mp3' | 'wav';
    lastUsedAt: number;
};

const MANIFEST_VERSION = 1;
const MANIFEST_FILENAME = 'index.json';

const cacheFilePath = (
    cacheDirectory: string,
    key: string,
    format: 'mp3' | 'wav'
) => join(cacheDirectory, `${key}.${format}`);

const canonicalize = (value: unknown) => (value === undefined ? null : value);

/**
 * 内容哈希:任何影响合成结果的输入都进 key。
 * 对象字面量字段顺序固定,JSON 序列化结果稳定。
 */
const computeCacheKey = (
    providerName: string,
    input: TtsSynthesisInput
): string => {
    const canonical = {
        format: 'tts-cache-v1',
        providerName,
        speedRatio: canonicalize(input.speedRatio),
        text: input.text,
        voice: input.voice,
        volumeRatio: canonicalize(input.volumeRatio)
    };

    return createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
};

export class TtsCacheProvider implements TtsProvider {
    readonly providerName: string;
    private readonly inner: TtsProvider;
    private readonly cacheDirectory: string;
    private readonly maxEntries: number;
    private readonly now: () => number;
    private readonly manifestPath: string;
    /** LRU 容器:Map 迭代序即访问序,访问 = delete + set 移到队尾。 */
    private readonly entries = new Map<string, CacheEntry>();
    /** 同 key 并发请求去重:key → 进行中的合成 Promise(成功/失败都清掉)。 */
    private readonly pendingByKey = new Map<string, Promise<void>>();
    private initPromise: Promise<void> | null = null;
    /** manifest 串行写入链,避免并发写坏文件。 */
    private persistChain: Promise<void> = Promise.resolve();

    constructor({
        cacheDirectory,
        inner,
        maxEntries = 128,
        now = () => Date.now()
    }: TtsCacheProviderOptions) {
        this.inner = inner;
        this.providerName = inner.providerName;
        this.cacheDirectory = cacheDirectory;
        this.maxEntries = Math.max(1, maxEntries);
        this.now = now;
        this.manifestPath = join(cacheDirectory, MANIFEST_FILENAME);
    }

    synthesizeSpeech(input: TtsSynthesisInput): Promise<TtsSynthesisResult> {
        return this.initialize().then(() => this.doSynthesize(input));
    }

    private async doSynthesize(
        input: TtsSynthesisInput
    ): Promise<TtsSynthesisResult> {
        const key = computeCacheKey(this.providerName, input);
        const hit = await this.tryServeFromCache(key, input);

        if (hit) {
            // eslint-disable-next-line no-console
            console.log(`[tts-cache] HIT ${this.describeInput(input)}`);

            return hit;
        }

        const pending = this.pendingByKey.get(key);

        if (pending) {
            // 同内容正在合成:等它完成,再从缓存给本次调用物化自己的 outputPath。
            await pending;
            const served = await this.tryServeFromCache(key, input);

            if (served) {
                // eslint-disable-next-line no-console
                console.log(`[tts-cache] HIT ${this.describeInput(input)}`);

                return served;
            }
            // 极端情况:缓存落盘失败导致没有条目 → 放弃去重,走一次真实合成。
        }

        // eslint-disable-next-line no-console
        console.log(`[tts-cache] MISS ${this.describeInput(input)}`);

        const synthesis = this.inner
            .synthesizeSpeech(input)
            .then(async (result) => {
                // 先落盘缓存再 resolve:保证「合成完成后立即再调同内容」必然命中,
                // 也让并发等待者能从缓存拿到结果。storeCacheEntry 内部吞掉一切
                // 错误,缓存写失败不会影响合成结果本身。
                await this.storeCacheEntry(key, result);

                return result;
            })
            .finally(() => {
                this.pendingByKey.delete(key);
            });

        this.pendingByKey.set(
            key,
            synthesis.then(() => undefined)
        );

        return synthesis;
    }

    private describeInput(input: TtsSynthesisInput): string {
        const text =
            input.text.length > 16 ? `${input.text.slice(0, 16)}…` : input.text;

        return `voice=${input.voice} text="${text}"`;
    }

    /**
     * 命中缓存:把缓存音频复制到本次 outputPath,返回与未命中一致的 result。
     * 缓存文件缺失/损坏时删条目返回 null,由调用方回退真实合成。
     */
    private async tryServeFromCache(
        key: string,
        input: TtsSynthesisInput
    ): Promise<TtsSynthesisResult | null> {
        const entry = this.entries.get(key);

        if (!entry) {
            return null;
        }

        const source = cacheFilePath(this.cacheDirectory, key, entry.format);

        try {
            await copyFile(source, input.outputPath);
            this.touch(key);
            void this.persistManifest();
            this.emitHitEvents(input, entry);

            return {
                byteLength: entry.byteLength,
                durationMs: entry.durationMs,
                format: entry.format,
                path: input.outputPath
            };
        } catch {
            // 缓存文件被删/损坏:当 miss 处理,并清掉这条坏条目。
            this.entries.delete(key);

            return null;
        }
    }

    /** 缓存落盘是 best-effort:失败不影响合成结果。 */
    private async storeCacheEntry(
        key: string,
        result: TtsSynthesisResult
    ): Promise<void> {
        try {
            await mkdir(this.cacheDirectory, { recursive: true });
            const target = cacheFilePath(
                this.cacheDirectory,
                key,
                result.format
            );

            await copyFile(result.path, target);
            this.entries.set(key, {
                byteLength: result.byteLength,
                durationMs: result.durationMs,
                format: result.format,
                lastUsedAt: this.now()
            });
            this.evict();
            void this.persistManifest();
        } catch {
            // 磁盘满 / 权限不足等:静默,只丢缓存收益,不丢合成。
        }
    }

    private touch(key: string) {
        const entry = this.entries.get(key);

        if (!entry) {
            return;
        }

        this.entries.delete(key);
        entry.lastUsedAt = this.now();
        this.entries.set(key, entry);
    }

    /** 从最久未用(队首)开始淘汰,直到回到容量内,并删掉对应缓存文件。 */
    private evict() {
        while (this.entries.size > this.maxEntries) {
            const oldestKey = this.entries.keys().next().value;

            if (oldestKey === undefined) {
                break;
            }

            const oldest = this.entries.get(oldestKey);

            this.entries.delete(oldestKey);

            if (oldest) {
                void rm(
                    cacheFilePath(
                        this.cacheDirectory,
                        oldestKey,
                        oldest.format
                    ),
                    { force: true }
                ).catch(() => {
                    // 删不掉也没关系,下次命中会当损坏条目清理。
                });
            }
        }
    }

    private emitHitEvents(input: TtsSynthesisInput, entry: CacheEntry) {
        if (!input.emit) {
            return;
        }

        input.emit({
            textLength: input.text.length,
            type: 'tts.started',
            voice: input.voice
        });
        input.emit({
            byteLength: entry.byteLength,
            type: 'tts.chunk'
        });
        input.emit({
            byteLength: entry.byteLength,
            durationMs: entry.durationMs,
            outputPath: input.outputPath,
            type: 'tts.completed'
        });
    }

    /**
     * 启动时恢复 manifest:容忍损坏/缺失,条目文件不存在的自动丢弃。
     * Map 插入序保持 JSON 里的存储序(旧条目在前),LRU 顺序可续。
     */
    private initialize(): Promise<void> {
        if (!this.initPromise) {
            this.initPromise = this.loadManifest();
        }

        return this.initPromise;
    }

    private async loadManifest(): Promise<void> {
        try {
            await mkdir(this.cacheDirectory, { recursive: true });
            const raw = await readFile(this.manifestPath, 'utf8');
            const parsed = JSON.parse(raw) as {
                entries?: Record<string, unknown>;
                version?: number;
            };

            if (parsed?.version !== MANIFEST_VERSION) {
                return;
            }

            for (const [key, value] of Object.entries(parsed.entries ?? {})) {
                const meta = value as Partial<CacheEntry>;

                if (
                    typeof meta.byteLength !== 'number' ||
                    typeof meta.durationMs !== 'number' ||
                    (meta.format !== 'mp3' && meta.format !== 'wav')
                ) {
                    continue;
                }

                const file = cacheFilePath(
                    this.cacheDirectory,
                    key,
                    meta.format
                );

                try {
                    await stat(file);
                } catch {
                    continue; // 缓存文件已不在,条目作废
                }

                this.entries.set(key, {
                    byteLength: meta.byteLength,
                    durationMs: meta.durationMs,
                    format: meta.format,
                    lastUsedAt:
                        typeof meta.lastUsedAt === 'number'
                            ? meta.lastUsedAt
                            : 0
                });
            }
        } catch {
            // manifest 缺失或损坏 → 空缓存启动,不报错。
        }

        // 孤儿清理:manifest 之外的缓存音频文件(上次写入失败 / manifest
        // 丢失留下的)直接删掉,避免磁盘无限增长。只删符合
        // `<64位hex>.<mp3|wav>` 命名的文件,绝不碰其他文件。
        try {
            const files = await readdir(this.cacheDirectory);

            await Promise.all(
                files.map(async (name) => {
                    if (name === MANIFEST_FILENAME) return;

                    const match = /^([0-9a-f]{64})\.(mp3|wav)$/.exec(name);

                    if (!match) return;

                    const [, key, format] = match;
                    const known = this.entries.get(key);

                    if (known && known.format === format) return;

                    await rm(join(this.cacheDirectory, name), { force: true });
                })
            );
        } catch {
            // 清理失败不阻塞启动,下次再试。
        }

        this.evict();
    }

    /** 串行落盘 manifest,任何一次失败不影响后续写入。 */
    private persistManifest(): Promise<void> {
        this.persistChain = this.persistChain.then(async () => {
            try {
                const entries = Object.fromEntries(
                    [...this.entries.entries()].map(([key, entry]) => [
                        key,
                        {
                            byteLength: entry.byteLength,
                            durationMs: entry.durationMs,
                            format: entry.format,
                            lastUsedAt: entry.lastUsedAt
                        }
                    ])
                );

                await mkdir(this.cacheDirectory, { recursive: true });
                await writeFile(
                    this.manifestPath,
                    JSON.stringify({
                        entries,
                        version: MANIFEST_VERSION
                    }),
                    'utf8'
                );
            } catch {
                // 写失败静默:下次合成会再尝试。
            }
        });

        return this.persistChain;
    }
}
