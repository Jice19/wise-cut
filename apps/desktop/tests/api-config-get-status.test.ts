/* */
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
    createApiConfigStore,
    type SafeStorageLike
} from '../client/api-config-store';
import { registerApiConfigIpc } from '../client/api-config-ipc';

const createInMemorySafeStorage = (): SafeStorageLike => {
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
            const cached = store.get(encrypted.toString('hex'));

            if (cached) return cached.toString('utf8');

            const result = xor(encrypted).toString('utf8');
            store.set(encrypted.toString('hex'), Buffer.from(result, 'utf8'));

            return result;
        },
        encryptString(plainText) {
            const encrypted = xor(plainText);

            store.set(
                encrypted.toString('hex'),
                Buffer.from(plainText, 'utf8')
            );

            return encrypted;
        },
        isEncryptionAvailable: () => true
    };
};

type IpcHandler = (...args: unknown[]) => unknown | Promise<unknown>;

/**
 * 极简 fake ipcMain — 只支持 handle(channel, fn) 一个方法,
 * 跑回调拿返回值。不模拟 Event / webContents,跟我们用法一致。
 */
const createFakeIpcMain = () => {
    const handlers = new Map<string, IpcHandler>();

    return {
        handle: (channel: string, handler: IpcHandler) => {
            handlers.set(channel, handler);
        },
        invoke: (channel: string, ...args: unknown[]) => {
            const handler = handlers.get(channel);

            if (!handler) {
                throw new Error(`No handler registered for '${channel}'`);
            }

            // Electron IPC handler 第一个参数永远是 event object,
            // 我们不模拟事件,传空对象占位。
            return handler({}, ...args);
        }
    };
};

describe('api-config IPC — getStatus 不返回 stale data', () => {
    let tempDirectory: string;
    let safeStorage: SafeStorageLike;

    beforeEach(async () => {
        tempDirectory = await mkdtemp(join(tmpdir(), 'app-ipc-status-'));
        safeStorage = createInMemorySafeStorage();
    });

    afterEach(async () => {
        await rm(tempDirectory, { force: true, recursive: true });
    });

    it('returns isConfigured=true after set, even without restarting', () => {
        // 关键回归:之前 getStatus 用启动时的 storedApiConfig 闭包,
        // app 运行时改 key 后再调 getStatus 还是返回旧值。
        const ipc = createFakeIpcMain();
        const store = createApiConfigStore({
            safeStorage,
            userDataPath: tempDirectory
        });

        registerApiConfigIpc({
            clear: () => {
                store.clear();
            },
            getStatus: () => {
                const current = store.read();

                return { isConfigured: Boolean(current?.apiKey) };
            },
            ipcMain: ipc as never,
            set: ({ apiKey }) => {
                store.write({
                    apiKey,
                    baseUrl: 'https://example.com',
                    llmModel: 'm1',
                    ttsModel: 't1'
                });
            }
        });

        // 启动时:没配 → false
        expect(ipc.invoke('api-config:get-status')).toEqual({
            isConfigured: false
        });

        // 用户在 UI 上保存 key
        ipc.invoke('api-config:set', { apiKey: 'sk-test-1234' });

        // 立刻查 status:应该是 true(不要等重启)
        expect(ipc.invoke('api-config:get-status')).toEqual({
            isConfigured: true
        });

        // clear 后再查:false
        ipc.invoke('api-config:clear');
        expect(ipc.invoke('api-config:get-status')).toEqual({
            isConfigured: false
        });
    });

    it('persists across simulated app restart (new ipcMain, same store on disk)', async () => {
        const ipc1 = createFakeIpcMain();
        const store1 = createApiConfigStore({
            safeStorage,
            userDataPath: tempDirectory
        });

        registerApiConfigIpc({
            clear: () => {
                store1.clear();
            },
            getStatus: () => {
                const current = store1.read();

                return { isConfigured: Boolean(current?.apiKey) };
            },
            ipcMain: ipc1 as never,
            set: ({ apiKey }) => {
                store1.write({
                    apiKey,
                    baseUrl: 'https://example.com',
                    llmModel: 'm1',
                    ttsModel: 't1'
                });
            }
        });

        // 第一个 session:写 key
        ipc1.invoke('api-config:set', { apiKey: 'persistent-key' });
        expect(ipc1.invoke('api-config:get-status')).toEqual({
            isConfigured: true
        });

        // 模拟 app 重启:新 ipcMain,新 store 实例(同一目录)
        const ipc2 = createFakeIpcMain();
        const store2 = createApiConfigStore({
            safeStorage,
            userDataPath: tempDirectory
        });

        registerApiConfigIpc({
            clear: () => {
                store2.clear();
            },
            getStatus: () => {
                const current = store2.read();

                return { isConfigured: Boolean(current?.apiKey) };
            },
            ipcMain: ipc2 as never,
            set: ({ apiKey }) => {
                store2.write({
                    apiKey,
                    baseUrl: 'https://example.com',
                    llmModel: 'm1',
                    ttsModel: 't1'
                });
            }
        });

        // 第二个 session:应该看到 key
        expect(ipc2.invoke('api-config:get-status')).toEqual({
            isConfigured: true
        });
    });
});
