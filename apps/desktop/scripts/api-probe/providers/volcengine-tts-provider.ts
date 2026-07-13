/**
 * 火山方舟 Agent Plan TTS —— Provider 封装。
 *
 * 与 miaoma-magicut/packages/video-agent/src/providers/volcengine-tts-provider.ts
 * 1:1 对齐,简化点:
 *   - 不依赖 ffprobe / mkdir 事件,只负责 bytes 输出(留给 probe 层决定是否 ffprobe 探时长)
 *   - 不引入 AgentEnv 复杂类型,直接接受 plain options
 *   - 保留 SocketFactory 注入点,方便未来单测写 fake
 *
 * 协议层详见 ./tts-protocol/。
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

import WebSocket, { type RawData } from 'ws';

import {
    EventType,
    fullClientRequest,
    MsgType,
    receiveMessage,
    type TtsProtocolSocket
} from '../tts-protocol';

export type TtsProviderEvent =
    | { textLength: number; type: 'tts.started'; voice: string }
    | { byteLength: number; type: 'tts.chunk' }
    | {
          byteLength: number;
          durationMs?: number;
          outputPath: string;
          type: 'tts.completed';
      }
    | { error: string; type: 'tts.failed' };

export type TtsSynthesisInput = {
    emit?: (event: TtsProviderEvent) => void;
    outputPath: string;
    speedRatio?: number;
    text: string;
    voice?: string;
    volumeRatio?: number;
};

export type TtsSynthesisResult = {
    byteLength: number;
    format: 'mp3';
    path: string;
};

const DEFAULT_ENDPOINT =
    'wss://openspeech.bytedance.com/api/v3/plan/tts/unidirectional/stream';
const DEFAULT_RESOURCE_ID = 'seed-tts-2.0';
const DEFAULT_SAMPLE_RATE = 24000;
const DEFAULT_FORMAT = 'mp3' as const;

type SocketFactoryInput = {
    endpoint: string;
    headers: Record<string, string>;
};

type SocketFactory = (input: SocketFactoryInput) => Promise<TtsProtocolSocket>;

export class VolcengineTtsProviderError extends Error {
    constructor(
        message: string,
        readonly options: {
            errorCode?: number;
        } = {}
    ) {
        super(message);
        this.name = 'VolcengineTtsProviderError';
    }
}

export type VolcengineTtsProviderOptions = {
    apiKey: string;
    connect?: SocketFactory;
    endpoint?: string;
    format?: 'mp3';
    resourceId?: string;
    sampleRate?: number;
    voice?: string;
};

const rawDataToUint8Array = (data: RawData): Uint8Array => {
    if (Array.isArray(data)) {
        return new Uint8Array(Buffer.concat(data));
    }

    if (data instanceof ArrayBuffer) {
        return new Uint8Array(data);
    }

    return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
};

export const createWsTtsProtocolSocket: SocketFactory = async ({
    endpoint,
    headers
}) =>
    new Promise((resolve, reject) => {
        const ws = new WebSocket(endpoint, {
            headers,
            maxPayload: 10 * 1024 * 1024
        });
        const messages: Uint8Array[] = [];
        const waitingReceivers: {
            reject: (error: unknown) => void;
            resolve: (data: Uint8Array) => void;
        }[] = [];
        let opened = false;
        let closed = false;

        const protocolSocket: TtsProtocolSocket = {
            close: async () => {
                if (closed || ws.readyState === WebSocket.CLOSED) {
                    return;
                }
                await new Promise<void>((closeResolve) => {
                    ws.once('close', () => closeResolve());
                    ws.close();
                });
            },
            receive: async () => {
                const message = messages.shift();

                if (message) {
                    return message;
                }

                if (closed) {
                    throw new Error('TTS WebSocket is closed');
                }

                return new Promise<Uint8Array>(
                    (receiveResolve, receiveReject) => {
                        waitingReceivers.push({
                            reject: receiveReject,
                            resolve: receiveResolve
                        });
                    }
                );
            },
            send: async (data) => {
                await new Promise<void>((sendResolve, sendReject) => {
                    ws.send(data, (error) => {
                        if (error) {
                            sendReject(error);
                            return;
                        }
                        sendResolve();
                    });
                });
            }
        };

        ws.once('open', () => {
            opened = true;
            resolve(protocolSocket);
        });

        ws.on('message', (data) => {
            const message = rawDataToUint8Array(data);
            const receiver = waitingReceivers.shift();

            if (receiver) {
                receiver.resolve(message);
                return;
            }

            messages.push(message);
        });

        ws.once('close', () => {
            closed = true;
            for (const receiver of waitingReceivers.splice(0)) {
                receiver.reject(new Error('TTS WebSocket closed'));
            }
        });

        ws.once('error', (error) => {
            for (const receiver of waitingReceivers.splice(0)) {
                receiver.reject(error);
            }

            if (!opened) {
                reject(error);
            }
        });
    });

export class VolcengineTtsProvider {
    readonly providerName = 'volcengine-seed-tts';

    private readonly apiKey: string;
    private readonly connect: SocketFactory;
    private readonly endpoint: string;
    private readonly format: 'mp3';
    private readonly resourceId: string;
    private readonly sampleRate: number;
    private readonly voice: string | undefined;

    constructor({
        apiKey,
        connect = createWsTtsProtocolSocket,
        endpoint = DEFAULT_ENDPOINT,
        format = DEFAULT_FORMAT,
        resourceId = DEFAULT_RESOURCE_ID,
        sampleRate = DEFAULT_SAMPLE_RATE,
        voice
    }: VolcengineTtsProviderOptions) {
        this.apiKey = apiKey;
        this.connect = connect;
        this.endpoint = endpoint;
        this.format = format;
        this.resourceId = resourceId;
        this.sampleRate = sampleRate;
        this.voice = voice;
    }

    async synthesizeSpeech({
        emit,
        outputPath,
        speedRatio,
        text,
        voice,
        volumeRatio
    }: TtsSynthesisInput): Promise<TtsSynthesisResult> {
        const resolvedVoice = voice ?? this.voice;

        if (!resolvedVoice) {
            throw new VolcengineTtsProviderError(
                'VolcengineTtsProvider requires a `voice` (speaker id)'
            );
        }

        const socket = await this.connect({
            endpoint: this.endpoint,
            headers: {
                'X-Api-Key': this.apiKey,
                'X-Api-Resource-Id': this.resourceId,
                'X-Control-Require-Usage-Tokens-Return': '*'
            }
        });

        try {
            emit?.({
                textLength: text.length,
                type: 'tts.started',
                voice: resolvedVoice
            });

            await fullClientRequest(
                socket,
                new TextEncoder().encode(
                    JSON.stringify({
                        req_params: {
                            audio_params: {
                                format: this.format,
                                sample_rate: this.sampleRate,
                                ...(typeof speedRatio === 'number'
                                    ? { speed_ratio: speedRatio }
                                    : {}),
                                ...(typeof volumeRatio === 'number'
                                    ? { volume_ratio: volumeRatio }
                                    : {})
                            },
                            speaker: resolvedVoice,
                            text
                        }
                    })
                )
            );

            const chunks: Uint8Array[] = [];

            while (true) {
                const message = await receiveMessage(socket);

                if (message.msgType === MsgType.Error) {
                    throw new VolcengineTtsProviderError(
                        `TTS conversion failed: ${new TextDecoder().decode(
                            message.payload
                        )}`,
                        {
                            errorCode: message.errorCode
                        }
                    );
                }

                if (
                    message.msgType === MsgType.FullServerResponse &&
                    message.event === EventType.SessionFinished
                ) {
                    break;
                }

                if (
                    message.msgType === MsgType.AudioOnlyServer &&
                    message.payload.byteLength > 0
                ) {
                    chunks.push(message.payload);
                    emit?.({
                        byteLength: message.payload.byteLength,
                        type: 'tts.chunk'
                    });
                }
            }

            const totalBytes = chunks.reduce(
                (sum, chunk) => sum + chunk.byteLength,
                0
            );

            if (totalBytes === 0) {
                throw new VolcengineTtsProviderError('No audio data received');
            }

            await mkdir(dirname(outputPath), { recursive: true });
            await writeFile(
                outputPath,
                Buffer.concat(chunks.map((c) => Buffer.from(c)))
            );

            emit?.({
                byteLength: totalBytes,
                outputPath,
                type: 'tts.completed'
            });

            return {
                byteLength: totalBytes,
                format: this.format,
                path: outputPath
            };
        } catch (error) {
            const message =
                error instanceof Error ? error.message : String(error);
            emit?.({
                error: message,
                type: 'tts.failed'
            });

            if (error instanceof VolcengineTtsProviderError) {
                throw new VolcengineTtsProviderError(message, error.options);
            }

            throw new VolcengineTtsProviderError(message);
        } finally {
            await socket.close();
        }
    }
}
