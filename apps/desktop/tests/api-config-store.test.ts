/* */
import { writeFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
    ApiConfigStoreError,
    createApiConfigStore,
    type ApiConfig,
    type SafeStorageLike
} from '../client/api-config-store';

const sampleConfig: ApiConfig = {
    apiKey: 'test-api-key-123',
    baseUrl: 'https://ark.cn-beijing.volces.com/api/plan/v3',
    llmModel: 'doubao-seed-2.0-pro',
    ttsModel: 'seed-tts-2.0'
};

const createInMemorySafeStorage = (): SafeStorageLike => {
    // 简单 XOR "加密",够单测用了 — 真用的时候走 Electron safeStorage。
    const store = new Map<string, Buffer>();
    const key = 'unit-test-key';

    const xor = (input: Buffer | string) => {
        const buf =
            typeof input === 'string' ? Buffer.from(input, 'utf8') : input;
        const out = Buffer.allocUnsafe(buf.length);

        for (let index = 0; index < buf.length; index += 1) {
            // eslint-disable-next-line no-bitwise
            out[index] = buf[index] ^ key.charCodeAt(index % key.length);
        }

        return out;
    };

    return {
        decryptString(encrypted) {
            return xor(encrypted).toString('utf8');
        },
        encryptString(plainText) {
            return xor(plainText);
        },
        isEncryptionAvailable: () => true
    };
};

describe('createApiConfigStore', () => {
    let tempDirectory: string;
    let safeStorage: SafeStorageLike;

    beforeEach(async () => {
        tempDirectory = await mkdtemp(join(tmpdir(), 'app-api-config-'));
        safeStorage = createInMemorySafeStorage();
    });

    afterEach(async () => {
        await rm(tempDirectory, { force: true, recursive: true });
    });

    it('returns null when no config has been written', () => {
        const store = createApiConfigStore({
            safeStorage,
            userDataPath: tempDirectory
        });

        expect(store.read()).toBeNull();
    });

    it('round-trips a written config (write then read)', () => {
        const store = createApiConfigStore({
            safeStorage,
            userDataPath: tempDirectory
        });

        store.write(sampleConfig);
        expect(store.read()).toEqual(sampleConfig);
    });

    it('clear removes the file and read returns null', () => {
        const store = createApiConfigStore({
            safeStorage,
            userDataPath: tempDirectory
        });

        store.write(sampleConfig);
        store.clear();
        expect(store.read()).toBeNull();
    });

    it('clear is idempotent when no file exists', () => {
        const store = createApiConfigStore({
            safeStorage,
            userDataPath: tempDirectory
        });

        expect(() => store.clear()).not.toThrow();
    });

    it('overwrite replaces the previous config (no append)', () => {
        const store = createApiConfigStore({
            safeStorage,
            userDataPath: tempDirectory
        });

        store.write(sampleConfig);
        const updated: ApiConfig = {
            ...sampleConfig,
            apiKey: 'rotated-key-456'
        };
        store.write(updated);

        expect(store.read()).toEqual(updated);
    });

    it('read triggers onCorruptConfig and returns null when decrypt produces invalid JSON', () => {
        // 直接用 fs 写一个乱码文件,绕过 store.write,模拟"用户从外部
        // 改了文件 / 加密 key 变了 / 文件被截断"。
        const store = createApiConfigStore({
            safeStorage,
            userDataPath: tempDirectory
        });
        // 先正常 write 一次创建文件
        store.write(sampleConfig);

        // 再用 fs 覆盖成乱码(unsafeRawBytes — 我们用 safeStorage
        // 假装能 encrypt 一段 plaintext,但 plaintext 不是合法 JSON)
        const brokenSafeStorage: SafeStorageLike = {
            decryptString: () => 'this is not json {{',
            encryptString: safeStorage.encryptString,
            isEncryptionAvailable: () => true
        };
        const brokenStore = createApiConfigStore({
            safeStorage: brokenSafeStorage,
            userDataPath: tempDirectory
        });
        const onCorruptConfig = vi.fn();
        const observingStore = createApiConfigStore({
            onCorruptConfig,
            safeStorage: brokenSafeStorage,
            userDataPath: tempDirectory
        });

        // sanity:brokenStore 拿不到合法 JSON
        expect(brokenStore.read()).toBeNull();
        // observingStore 走 onCorruptConfig 回调
        observingStore.read();
        expect(onCorruptConfig).toHaveBeenCalledTimes(1);
    });

    it('read returns null when stored version is unsupported (no crash)', () => {
        // 直接用底层 fs 写一个 version=999 的"未来"config,
        // 模拟老用户升级 app 后老 config 还在。read 应该按"不识别"
        // 处理,触发 onCorruptConfig 但不抛。
        const store = createApiConfigStore({
            safeStorage,
            userDataPath: tempDirectory
        });
        // 先正常 write 一次创建文件(让 store 知道文件名)
        store.write(sampleConfig);
        // 再覆盖成 version 999 的内容(用同一个 safeStorage 加密,
        // 这样 decryptString 能解)
        const encrypted = safeStorage.encryptString(
            JSON.stringify({ config: sampleConfig, version: 999 })
        );
        writeFileSync(store.filePath, encrypted);

        const onCorruptConfig = vi.fn();
        const observingStore = createApiConfigStore({
            onCorruptConfig,
            safeStorage,
            userDataPath: tempDirectory
        });

        expect(observingStore.read()).toBeNull();
        expect(onCorruptConfig).toHaveBeenCalledTimes(1);
        expect(onCorruptConfig.mock.calls[0]?.[0]).toBeInstanceOf(Error);
    });

    it('write throws ApiConfigStoreError when safeStorage isEncryptionAvailable returns false', () => {
        const unavailableSafeStorage: SafeStorageLike = {
            ...createInMemorySafeStorage(),
            isEncryptionAvailable: () => false
        };
        const store = createApiConfigStore({
            safeStorage: unavailableSafeStorage,
            userDataPath: tempDirectory
        });

        expect(() => store.write(sampleConfig)).toThrow(ApiConfigStoreError);
        try {
            store.write(sampleConfig);
        } catch (error) {
            expect(error).toBeInstanceOf(ApiConfigStoreError);
            expect((error as ApiConfigStoreError).code).toBe(
                'safe_storage_unavailable'
            );
        }
    });

    it('filePath points to userDataPath/api-config.bin', () => {
        const store = createApiConfigStore({
            safeStorage,
            userDataPath: tempDirectory
        });

        expect(store.filePath).toBe(join(tempDirectory, 'api-config.bin'));
    });
});
