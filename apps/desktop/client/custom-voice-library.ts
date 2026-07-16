
import { randomUUID } from 'node:crypto';
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { createCustomIndexTts2VoiceType } from '@wise-cut/video-agent';

import type {
    CustomVoiceImportData,
    CustomVoiceImportInput,
    CustomVoiceItem,
    CustomVoiceProviderStatus
} from '../shared/custom-voice';
import { createCustomVoicePreviewUrl } from '../shared/media-protocol';

type FetchInit = {
    body?: string;
    headers?: Record<string, string>;
    method?: string;
};

type Fetch = (url: string, init?: FetchInit) => Promise<Response>;

type CustomVoiceLibraryOptions = {
    createId?: () => string;
    fetch?: Fetch;
    now?: () => string;
    rootDirectory: string;
    serverUrl?: string;
};

export type CustomVoiceLibrary = {
    checkIndexTts2: () => Promise<CustomVoiceProviderStatus>;
    importReferenceAudio: (
        input: CustomVoiceImportInput
    ) => Promise<CustomVoiceImportData>;
    list: () => Promise<CustomVoiceItem[]>;
    resolveReferencePath: (voiceOrId: string) => Promise<string>;
};

type PersistedCustomVoiceItem = CustomVoiceItem & {
    referencePath: string;
};

type CustomVoiceIndexFile = {
    voices: PersistedCustomVoiceItem[];
};

const supportedAudioExtensions = new Set([
    '.aac',
    '.flac',
    '.m4a',
    '.mp3',
    '.ogg',
    '.wav'
]);

const normalizeServerUrl = (serverUrl: string) => serverUrl.replace(/\/+$/, '');

const toSafeFileName = (value: string) =>
    value.trim().replace(/[^a-zA-Z0-9_-]/g, '_') || 'voice';

const toVoiceTitle = (filePath: string) => {
    const extension = path.extname(filePath);
    const baseName = path.basename(filePath, extension).trim();

    return baseName || '自定义音色';
};

const toPublicVoice = (voice: PersistedCustomVoiceItem): CustomVoiceItem => ({
    createdAt: voice.createdAt,
    id: voice.id,
    provider: voice.provider,
    previewAudioUrl: createCustomVoicePreviewUrl({
        voiceId: voice.id
    }),
    sourceFileName: voice.sourceFileName,
    title: voice.title,
    voiceType: voice.voiceType
});

const parseVoiceId = (voiceOrId: string) =>
    voiceOrId.startsWith('custom:index-tts2:')
        ? voiceOrId.slice('custom:index-tts2:'.length)
        : voiceOrId;

export const createCustomVoiceLibrary = ({
    createId = () => `voice_${randomUUID()}`,
    fetch = globalThis.fetch.bind(globalThis),
    now = () => new Date().toISOString(),
    rootDirectory,
    serverUrl = 'http://127.0.0.1:7860'
}: CustomVoiceLibraryOptions): CustomVoiceLibrary => {
    const normalizedServerUrl = normalizeServerUrl(serverUrl);
    const indexPath = path.join(rootDirectory, 'library.json');

    const readIndex = async (): Promise<CustomVoiceIndexFile> => {
        try {
            const content = await readFile(indexPath, 'utf8');
            const parsed = JSON.parse(content) as Partial<CustomVoiceIndexFile>;

            return {
                voices: Array.isArray(parsed.voices) ? parsed.voices : []
            };
        } catch (error) {
            if (
                error &&
                typeof error === 'object' &&
                'code' in error &&
                error.code === 'ENOENT'
            ) {
                return { voices: [] };
            }

            throw error;
        }
    };

    const writeIndex = async (index: CustomVoiceIndexFile) => {
        await mkdir(rootDirectory, { recursive: true });
        await writeFile(indexPath, `${JSON.stringify(index, null, 4)}\n`);
    };

    return {
        checkIndexTts2: async () => {
            try {
                const response = await fetch(
                    `${normalizedServerUrl}/gradio_api/info`
                );

                if (!response.ok) {
                    return {
                        available: false,
                        message: `IndexTTS2 服务响应异常：${response.status}`,
                        provider: 'index-tts2',
                        serverUrl: normalizedServerUrl
                    };
                }

                return {
                    available: true,
                    message: '本地 IndexTTS2 已就绪',
                    provider: 'index-tts2',
                    serverUrl: normalizedServerUrl
                };
            } catch (error) {
                return {
                    available: false,
                    message:
                        error instanceof Error
                            ? error.message
                            : '无法连接本地 IndexTTS2 服务',
                    provider: 'index-tts2',
                    serverUrl: normalizedServerUrl
                };
            }
        },
        importReferenceAudio: async ({ filePath }) => {
            if (!filePath) {
                throw new Error('请选择原始音色音频');
            }

            const extension = path.extname(filePath).toLowerCase();

            if (!supportedAudioExtensions.has(extension)) {
                throw new Error('仅支持 wav、mp3、m4a、aac、flac、ogg 音频');
            }

            const id = toSafeFileName(createId());
            const voiceDirectory = path.join(rootDirectory, id);
            const referencePath = path.join(
                voiceDirectory,
                `reference${extension}`
            );
            const sourceFileName = path.basename(filePath);
            const voice: PersistedCustomVoiceItem = {
                createdAt: now(),
                id,
                provider: 'index-tts2',
                referencePath,
                sourceFileName,
                title: toVoiceTitle(filePath),
                voiceType: createCustomIndexTts2VoiceType(id)
            };
            const index = await readIndex();
            const nextIndex = {
                voices: [
                    ...index.voices.filter((item) => item.id !== id),
                    voice
                ]
            };

            await mkdir(voiceDirectory, { recursive: true });
            await copyFile(filePath, referencePath);
            await writeIndex(nextIndex);

            return {
                voice: toPublicVoice(voice)
            };
        },
        list: async () => {
            const index = await readIndex();

            return index.voices.map(toPublicVoice);
        },
        resolveReferencePath: async (voiceOrId) => {
            const voiceId = parseVoiceId(voiceOrId);
            const index = await readIndex();
            const voice = index.voices.find((item) => item.id === voiceId);

            if (!voice) {
                throw new Error(`未找到自定义音色：${voiceId}`);
            }

            return voice.referencePath;
        }
    };
};
