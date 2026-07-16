/* */
import { copyFile, mkdir, readFile, stat } from 'node:fs/promises';
import { dirname, extname } from 'node:path';

import { probeAudioDuration } from '../audio/probe-audio-duration';
import { serializeError } from '../events/event-emitter';

import type {
    TtsProvider,
    TtsProviderEvent,
    TtsSynthesisInput,
    TtsSynthesisResult
} from './tts-provider';

const DEFAULT_SERVER_URL = 'http://127.0.0.1:7860';
const CUSTOM_INDEX_TTS2_PREFIX = 'custom:index-tts2:';

type FetchInit = {
    body?: FormData | string;
    headers?: Record<string, string>;
    method?: string;
};

type Fetch = (url: string, init?: FetchInit) => Promise<Response>;
type ProbeDuration = typeof probeAudioDuration;

type GradioFileData = {
    meta: {
        _type: 'gradio.FileData';
    };
    mime_type: string;
    orig_name: string;
    path: string;
};

type IndexTts2ProviderOptions = {
    fetch?: Fetch;
    ffprobePath?: string;
    maxTextTokensPerSegment?: number;
    probeDuration?: ProbeDuration;
    resolveVoiceReferencePath: (voiceId: string) => Promise<string> | string;
    serverUrl?: string;
};

export class IndexTts2ProviderError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'IndexTts2ProviderError';
    }
}

export const createCustomIndexTts2VoiceType = (voiceId: string) =>
    `${CUSTOM_INDEX_TTS2_PREFIX}${voiceId.trim()}`;

export const parseCustomIndexTts2VoiceId = (voice: string) => {
    if (!voice.startsWith(CUSTOM_INDEX_TTS2_PREFIX)) return undefined;

    const voiceId = voice.slice(CUSTOM_INDEX_TTS2_PREFIX.length).trim();

    return voiceId || undefined;
};

const normalizeServerUrl = (serverUrl: string) => serverUrl.replace(/\/+$/, '');

const createOutputPath = (outputPath: string) => {
    if (extname(outputPath).toLowerCase() === '.wav') return outputPath;

    return outputPath.replace(/\.[^/.]+$/, '') + '.wav';
};

const mimeTypeByExtension = new Map([
    ['.aac', 'audio/aac'],
    ['.flac', 'audio/flac'],
    ['.m4a', 'audio/mp4'],
    ['.mp3', 'audio/mpeg'],
    ['.ogg', 'audio/ogg'],
    ['.wav', 'audio/wav']
]);

const createFileData = (filePath: string): GradioFileData => ({
    meta: {
        _type: 'gradio.FileData'
    },
    mime_type:
        mimeTypeByExtension.get(extname(filePath).toLowerCase()) ??
        'application/octet-stream',
    orig_name: filePath.split(/[\\/]/).at(-1) ?? 'reference.wav',
    path: filePath
});

const uploadReferenceAudio = async ({
    fetch,
    filePath,
    serverUrl
}: {
    fetch: Fetch;
    filePath: string;
    serverUrl: string;
}) => {
    const formData = new FormData();
    const fileName = filePath.split(/[\\/]/).at(-1) ?? 'reference.wav';
    const fileBuffer = await readFile(filePath);

    formData.append(
        'files',
        new Blob([fileBuffer], {
            type:
                mimeTypeByExtension.get(extname(filePath).toLowerCase()) ??
                'application/octet-stream'
        }),
        fileName
    );

    const response = await fetch(`${serverUrl}/gradio_api/upload`, {
        body: formData,
        method: 'POST'
    });
    await assertOk(response, 'IndexTTS2 upload');

    const payload = (await response.json()) as unknown;

    if (!Array.isArray(payload) || typeof payload[0] !== 'string') {
        throw new IndexTts2ProviderError(
            `IndexTTS2 upload returned an invalid payload: ${JSON.stringify(payload)}`
        );
    }

    return payload[0];
};

const parseResultPath = (result: unknown): string => {
    if (typeof result === 'string') return result;

    if (Array.isArray(result) && result.length > 0) {
        return parseResultPath(result[0]);
    }

    if (result && typeof result === 'object') {
        const record = result as Record<string, unknown>;

        if (typeof record.path === 'string') return record.path;
        if (typeof record.value === 'string') return record.value;
        if (record.value && typeof record.value === 'object') {
            const nestedValue = record.value as Record<string, unknown>;

            if (typeof nestedValue.path === 'string') {
                return nestedValue.path;
            }
        }
    }

    throw new IndexTts2ProviderError(
        `Unsupported IndexTTS2 result: ${JSON.stringify(result)}`
    );
};

const readCompletedResult = async (response: Response) => {
    const body = await response.text();
    const lines = body.split(/\r?\n/);
    let eventName = '';

    for (const line of lines) {
        if (line.startsWith('event: ')) {
            eventName = line.slice('event: '.length).trim();
            continue;
        }

        if (!line.startsWith('data: ') || eventName !== 'complete') continue;

        const payload = line.slice('data: '.length).trim();

        if (!payload || payload === 'null') continue;

        return JSON.parse(payload) as unknown;
    }

    throw new IndexTts2ProviderError(
        'IndexTTS2 did not return a completed result'
    );
};

const assertOk = async (response: Response, context: string) => {
    if (response.ok) return;

    throw new IndexTts2ProviderError(
        `${context} failed: ${response.status} ${await response.text()}`
    );
};

export class IndexTts2Provider implements TtsProvider {
    private readonly fetch: Fetch;
    private readonly ffprobePath: string;
    private readonly maxTextTokensPerSegment: number;
    private readonly probeDuration: ProbeDuration;
    private readonly resolveVoiceReferencePath: (
        voiceId: string
    ) => Promise<string> | string;
    private readonly serverUrl: string;

    readonly providerName = 'index-tts2-local';

    constructor({
        fetch = globalThis.fetch.bind(globalThis),
        ffprobePath = 'ffprobe',
        maxTextTokensPerSegment = 120,
        probeDuration = probeAudioDuration,
        resolveVoiceReferencePath,
        serverUrl = DEFAULT_SERVER_URL
    }: IndexTts2ProviderOptions) {
        this.fetch = fetch;
        this.ffprobePath = ffprobePath;
        this.maxTextTokensPerSegment = maxTextTokensPerSegment;
        this.probeDuration = probeDuration;
        this.resolveVoiceReferencePath = resolveVoiceReferencePath;
        this.serverUrl = normalizeServerUrl(serverUrl);
    }

    async synthesizeSpeech({
        emit,
        outputPath,
        text,
        voice
    }: TtsSynthesisInput): Promise<TtsSynthesisResult> {
        const voiceId = parseCustomIndexTts2VoiceId(voice);

        if (!voiceId) {
            throw new IndexTts2ProviderError(
                `Unsupported custom voice: ${voice}`
            );
        }

        try {
            const referencePath = await this.resolveVoiceReferencePath(voiceId);
            const uploadedReferencePath = await uploadReferenceAudio({
                fetch: this.fetch,
                filePath: referencePath,
                serverUrl: this.serverUrl
            });

            emit?.({
                textLength: text.length,
                type: 'tts.started',
                voice
            });

            const submitResponse = await this.fetch(
                `${this.serverUrl}/gradio_api/call/gen_single`,
                {
                    body: JSON.stringify({
                        data: [
                            'Same as the voice reference',
                            createFileData(uploadedReferencePath),
                            text,
                            null,
                            0.65,
                            0,
                            0,
                            0,
                            0,
                            0,
                            0,
                            0,
                            0,
                            '',
                            false,
                            this.maxTextTokensPerSegment,
                            true,
                            0.8,
                            30,
                            0.8,
                            0,
                            3,
                            10,
                            1500
                        ]
                    }),
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    method: 'POST'
                }
            );
            await assertOk(submitResponse, 'IndexTTS2 submit');

            const submitPayload = (await submitResponse.json()) as {
                event_id?: string;
            };

            if (!submitPayload.event_id) {
                throw new IndexTts2ProviderError(
                    'IndexTTS2 submit response is missing event_id'
                );
            }

            const streamResponse = await this.fetch(
                `${this.serverUrl}/gradio_api/call/gen_single/${encodeURIComponent(
                    submitPayload.event_id
                )}`
            );
            await assertOk(streamResponse, 'IndexTTS2 stream');

            const resultPath = parseResultPath(
                await readCompletedResult(streamResponse)
            );
            const targetPath = createOutputPath(outputPath);

            await mkdir(dirname(targetPath), { recursive: true });
            await copyFile(resultPath, targetPath);

            const { size } = await stat(targetPath);
            const durationMs = await this.probeDuration({
                ffprobePath: this.ffprobePath,
                filePath: targetPath
            });

            emit?.({
                byteLength: size,
                type: 'tts.chunk'
            });
            emit?.({
                byteLength: size,
                durationMs,
                outputPath: targetPath,
                type: 'tts.completed'
            });

            return {
                byteLength: size,
                durationMs,
                format: 'wav',
                path: targetPath
            };
        } catch (error) {
            const message = this.serializeProviderError(error);
            emit?.({
                error: message,
                type: 'tts.failed'
            } satisfies TtsProviderEvent);

            if (error instanceof IndexTts2ProviderError) {
                throw new IndexTts2ProviderError(message);
            }

            throw new IndexTts2ProviderError(message);
        }
    }

    private serializeProviderError(error: unknown) {
        if (
            error instanceof TypeError &&
            error.message === 'fetch failed' &&
            'cause' in error
        ) {
            const cause = (error as TypeError & { cause?: unknown }).cause;
            const causeMessage =
                cause instanceof Error ? cause.message : serializeError(cause);

            return `IndexTTS2 请求失败（${this.serverUrl}）：${causeMessage}`;
        }

        return serializeError(error);
    }
}

export class RoutingTtsProvider implements TtsProvider {
    constructor(
        private readonly providers: {
            customProvider: TtsProvider;
            defaultProvider: TtsProvider;
        }
    ) {}

    /**
     * The routing provider forwards to either the custom (IndexTTS2) or the
     * default (cloud) provider; the persisted `provider` field on each
     * synthesized voice asset reflects whichever provider actually ran the
     * synthesis, not the router itself. We still expose a stable name so the
     * interface stays satisfied.
     */
    readonly providerName = 'routing-tts';

    synthesizeSpeech(input: TtsSynthesisInput) {
        if (parseCustomIndexTts2VoiceId(input.voice)) {
            return this.providers.customProvider.synthesizeSpeech(input);
        }

        return this.providers.defaultProvider.synthesizeSpeech(input);
    }
}
