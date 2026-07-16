/* */
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import WebSocket, { type RawData } from 'ws';

import { probeAudioDuration } from '../audio/probe-audio-duration';
import type { AgentEnv } from '../config/load-agent-env';
import { serializeError } from '../events/event-emitter';

import {
    EventType,
    fullClientRequest,
    MsgType,
    receiveMessage,
    type TtsProtocolSocket
} from './tts-protocol';
import type {
    TtsProvider,
    TtsProviderEvent,
    TtsSynthesisInput,
    TtsSynthesisResult
} from './tts-provider';

const DEFAULT_ENDPOINT =
    'wss://openspeech.bytedance.com/api/v3/plan/tts/unidirectional/stream';

type SocketFactoryInput = {
    endpoint: string;
    headers: Record<string, string>;
};

type SocketFactory = (input: SocketFactoryInput) => Promise<TtsProtocolSocket>;

type ProbeDuration = typeof probeAudioDuration;

type VolcengineTtsProviderOptions = {
    connect?: SocketFactory;
    endpoint?: string;
    env: Pick<AgentEnv, 'API_KEY' | 'TTS_MODEL'>;
    ffprobePath?: string;
    format?: 'mp3';
    probeDuration?: ProbeDuration;
    sampleRate?: number;
};

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

const rawDataToUint8Array = (data: RawData): Uint8Array => {
    if (Array.isArray(data)) {
        return Buffer.concat(data);
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

export class VolcengineTtsProvider implements TtsProvider {
    private readonly connect: SocketFactory;
    private readonly endpoint: string;
    private readonly env: Pick<AgentEnv, 'API_KEY' | 'TTS_MODEL'>;
    private readonly ffprobePath: string;
    private readonly format: 'mp3';
    private readonly probeDuration: ProbeDuration;
    private readonly sampleRate: number;

    readonly providerName = 'volcengine-seed-tts';

    constructor({
        connect = createWsTtsProtocolSocket,
        endpoint = DEFAULT_ENDPOINT,
        env,
        ffprobePath = 'ffprobe',
        format = 'mp3',
        probeDuration = probeAudioDuration,
        sampleRate = 24000
    }: VolcengineTtsProviderOptions) {
        this.connect = connect;
        this.endpoint = endpoint;
        this.env = env;
        this.ffprobePath = ffprobePath;
        this.format = format;
        this.probeDuration = probeDuration;
        this.sampleRate = sampleRate;
    }

    async synthesizeSpeech({
        emit,
        outputPath,
        speedRatio,
        text,
        voice,
        volumeRatio
    }: TtsSynthesisInput): Promise<TtsSynthesisResult> {
        const socket = await this.connect({
            endpoint: this.endpoint,
            headers: {
                'X-Api-Key': this.env.API_KEY,
                'X-Api-Resource-Id': this.env.TTS_MODEL,
                'X-Control-Require-Usage-Tokens-Return': '*'
            }
        });

        try {
            emit?.({
                textLength: text.length,
                type: 'tts.started',
                voice
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
                            speaker: voice,
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

            const audio = Buffer.concat(chunks);

            if (audio.byteLength === 0) {
                throw new VolcengineTtsProviderError('No audio data received');
            }

            await mkdir(dirname(outputPath), { recursive: true });
            await writeFile(outputPath, audio);

            const durationMs = await this.probeDuration({
                ffprobePath: this.ffprobePath,
                filePath: outputPath
            });

            emit?.({
                byteLength: audio.byteLength,
                durationMs,
                outputPath,
                type: 'tts.completed'
            });

            return {
                byteLength: audio.byteLength,
                durationMs,
                format: this.format,
                path: outputPath
            };
        } catch (error) {
            const redactedMessage = serializeError(error);
            emit?.({
                error: redactedMessage,
                type: 'tts.failed'
            } satisfies TtsProviderEvent);

            if (error instanceof VolcengineTtsProviderError) {
                throw new VolcengineTtsProviderError(
                    redactedMessage,
                    error.options
                );
            }

            throw new VolcengineTtsProviderError(redactedMessage);
        } finally {
            await socket.close();
        }
    }
}
