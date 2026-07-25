/* */
import {
    existsSync,
    mkdirSync,
    readFileSync,
    unlinkSync,
    writeFileSync
} from 'node:fs';
import { join } from 'node:path';

const CONFIG_FILENAME = 'api-config.bin';
const CONFIG_VERSION = 1;

export type ApiConfig = {
    apiKey: string;
    baseUrl: string;
    llmModel: string;
    ttsModel: string;
};

type StoredPayload = {
    config: ApiConfig;
    version: number;
};

/**
 * SafeStorage 的最小契约,只暴露我们需要的方法。测试时注入 fake
 * 实现,不用启 Electron 主进程。
 */
export type SafeStorageLike = {
    decryptString(encrypted: Buffer): string;
    encryptString(plainText: string): Buffer;
    isEncryptionAvailable?: () => boolean;
};

export type ApiConfigStoreErrorCode =
    | 'safe_storage_unavailable'
    | 'write_failed';

export class ApiConfigStoreError extends Error {
    public readonly code: ApiConfigStoreErrorCode;

    constructor(message: string, code: ApiConfigStoreErrorCode) {
        super(message);
        this.name = 'ApiConfigStoreError';
        this.code = code;
    }
}

export type CreateApiConfigStoreInput = {
    onCorruptConfig?: (error: unknown) => void;
    safeStorage: SafeStorageLike;
    userDataPath: string;
};

export type ApiConfigStore = {
    /**
     * 文件路径(用于调试 / 暴露给"在 Finder 中显示"按钮)。
     */
    readonly filePath: string;
    /**
     * 删除已存的配置。文件不存在不报错(幂等)。
     */
    clear: () => void;
    /**
     * 读配置。文件不存在 / 解析失败 / 解密失败都返回 null 并
     * 触发 onCorruptConfig 回调,主进程记一行 warn 但不阻塞启动
     * (让 onboarding 重新让用户配)。
     */
    read: () => ApiConfig | null;
    /**
     * 写配置。覆盖写。safeStorage 不可用时抛 ApiConfigStoreError。
     */
    write: (config: ApiConfig) => void;
};

const isCompleteConfig = (value: unknown): value is ApiConfig => {
    if (!value || typeof value !== 'object') return false;
    const candidate = value as Record<string, unknown>;

    return (
        typeof candidate.apiKey === 'string' &&
        candidate.apiKey.length > 0 &&
        typeof candidate.baseUrl === 'string' &&
        candidate.baseUrl.length > 0 &&
        typeof candidate.llmModel === 'string' &&
        candidate.llmModel.length > 0 &&
        typeof candidate.ttsModel === 'string' &&
        candidate.ttsModel.length > 0
    );
};

export const createApiConfigStore = ({
    onCorruptConfig,
    safeStorage,
    userDataPath
}: CreateApiConfigStoreInput): ApiConfigStore => {
    const filePath = join(userDataPath, CONFIG_FILENAME);

    const ensureEncryptionAvailable = () => {
        if (
            safeStorage.isEncryptionAvailable &&
            !safeStorage.isEncryptionAvailable()
        ) {
            throw new ApiConfigStoreError(
                'safeStorage encryption is not available on this system',
                'safe_storage_unavailable'
            );
        }
    };

    const read = (): ApiConfig | null => {
        if (!existsSync(filePath)) return null;

        try {
            const encrypted = readFileSync(filePath);
            const decrypted = safeStorage.decryptString(encrypted);
            const payload = JSON.parse(decrypted) as StoredPayload;

            if (payload.version !== CONFIG_VERSION) {
                throw new Error(
                    `Unsupported api config version: ${payload.version}`
                );
            }

            if (!isCompleteConfig(payload.config)) {
                throw new Error('Stored api config is missing required fields');
            }

            return payload.config;
        } catch (error) {
            // 解密失败 / JSON 解析失败 / 字段缺失 — 都当作"没配过",
            // 让 onboarding 重新让用户填。不要因为本地数据坏了就
            // 阻塞 App 启动(用户体验差,用户没法自救)。
            onCorruptConfig?.(error);

            return null;
        }
    };

    const write = (config: ApiConfig) => {
        ensureEncryptionAvailable();

        try {
            const plaintext = JSON.stringify({
                config,
                version: CONFIG_VERSION
            } satisfies StoredPayload);
            const encrypted = safeStorage.encryptString(plaintext);

            mkdirSync(userDataPath, { recursive: true });
            writeFileSync(filePath, encrypted, { mode: 0o600 });
        } catch (error) {
            throw new ApiConfigStoreError(
                `Failed to write api config: ${
                    error instanceof Error ? error.message : String(error)
                }`,
                'write_failed'
            );
        }
    };

    const clear = () => {
        if (existsSync(filePath)) {
            unlinkSync(filePath);
        }
    };

    return { clear, filePath, read, write };
};
