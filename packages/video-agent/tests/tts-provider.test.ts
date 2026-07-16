/* */
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { probeAudioDuration } from '../src/audio/probe-audio-duration';
import { serializeError } from '../src/events/event-emitter';
import {
    createCustomIndexTts2VoiceType,
    IndexTts2Provider,
    RoutingTtsProvider
} from '../src/providers/index-tts2-provider';
import {
    createTtsMessageFrame,
    EventType,
    MsgType,
    parseTtsMessageFrame,
    type TtsProtocolSocket
} from '../src/providers/tts-protocol';
import {
    VolcengineTtsProvider,
    VolcengineTtsProviderError
} from '../src/providers/volcengine-tts-provider';

class FakeTtsSocket implements TtsProtocolSocket {
    public closed = false;
    public readonly sent: Uint8Array[] = [];

    constructor(private readonly incoming: Uint8Array[]) {}

    async close() {
        this.closed = true;
    }

    async receive() {
        const next = this.incoming.shift();

        if (!next) {
            throw new Error('No incoming TTS message');
        }

        return next;
    }

    async send(data: Uint8Array) {
        this.sent.push(data);
    }
}

const createProvider = ({ incoming }: { incoming: Uint8Array[] }) => {
    const socket = new FakeTtsSocket(incoming);
    const provider = new VolcengineTtsProvider({
        connect: async ({ headers }) => {
            expect(headers).toMatchObject({
                'X-Api-Key': 'ark-sensitive-token-123456',
                'X-Api-Resource-Id': 'seed-tts-2.0',
                'X-Control-Require-Usage-Tokens-Return': '*'
            });

            return socket;
        },
        env: {
            API_KEY: 'ark-sensitive-token-123456',
            TTS_MODEL: 'seed-tts-2.0'
        },
        probeDuration: async ({ filePath }) => {
            expect(filePath).toContain('voice.mp3');

            return 1234;
        }
    });

    return { provider, socket };
};

describe('VolcengineTtsProvider', () => {
    it('writes streamed mp3 chunks and returns probed duration', async () => {
        const outputDir = await mkdtemp(join(tmpdir(), 'app-tts-'));
        const outputPath = join(outputDir, 'voice.mp3');
        const events: unknown[] = [];
        const { provider, socket } = createProvider({
            incoming: [
                createTtsMessageFrame({
                    event: EventType.TtsResponse,
                    msgType: MsgType.AudioOnlyServer,
                    payload: new Uint8Array([1, 2]),
                    sessionId: 'session-001'
                }),
                createTtsMessageFrame({
                    event: EventType.TtsResponse,
                    msgType: MsgType.AudioOnlyServer,
                    payload: new Uint8Array([3, 4]),
                    sessionId: 'session-001'
                }),
                createTtsMessageFrame({
                    event: EventType.SessionFinished,
                    msgType: MsgType.FullServerResponse,
                    payload: new Uint8Array(),
                    sessionId: 'session-001'
                })
            ]
        });

        const result = await provider.synthesizeSpeech({
            emit: (event) => events.push(event),
            outputPath,
            text: '智剪让视频创作更快',
            voice: 'zh_female_gaolengyujie_uranus_bigtts'
        });

        expect([...new Uint8Array(await readFile(outputPath))]).toEqual([
            1, 2, 3, 4
        ]);
        expect(result).toMatchObject({
            byteLength: 4,
            durationMs: 1234,
            format: 'mp3',
            path: outputPath
        });
        expect(socket.closed).toBe(true);
        expect(JSON.stringify(events)).not.toContain(
            'ark-sensitive-token-123456'
        );
        expect(events).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ type: 'tts.started' }),
                expect.objectContaining({ byteLength: 2, type: 'tts.chunk' }),
                expect.objectContaining({
                    byteLength: 4,
                    durationMs: 1234,
                    type: 'tts.completed'
                })
            ])
        );
    });

    it('passes voice speed and volume controls to the websocket request body', async () => {
        const outputDir = await mkdtemp(join(tmpdir(), 'app-tts-'));
        const outputPath = join(outputDir, 'voice.mp3');
        const { provider, socket } = createProvider({
            incoming: [
                createTtsMessageFrame({
                    event: EventType.TtsResponse,
                    msgType: MsgType.AudioOnlyServer,
                    payload: new Uint8Array([1, 2]),
                    sessionId: 'session-001'
                }),
                createTtsMessageFrame({
                    event: EventType.SessionFinished,
                    msgType: MsgType.FullServerResponse,
                    payload: new Uint8Array(),
                    sessionId: 'session-001'
                })
            ]
        });

        await provider.synthesizeSpeech({
            outputPath,
            speedRatio: 1.18,
            text: '智剪让视频创作更快',
            voice: 'zh_female_wenroushunv_uranus_bigtts',
            volumeRatio: 0.64
        });

        const request = parseTtsMessageFrame(socket.sent[0]!);
        const requestBody = JSON.parse(
            new TextDecoder().decode(request.payload)
        );

        expect(requestBody.req_params.audio_params).toMatchObject({
            format: 'mp3',
            sample_rate: 24000,
            speed_ratio: 1.18,
            volume_ratio: 0.64
        });
    });

    it('turns protocol errors into redacted provider errors', async () => {
        const outputDir = await mkdtemp(join(tmpdir(), 'app-tts-'));
        const { provider } = createProvider({
            incoming: [
                createTtsMessageFrame({
                    errorCode: 403,
                    event: EventType.SessionFailed,
                    msgType: MsgType.Error,
                    payload: new TextEncoder().encode(
                        'invalid key ark-sensitive-token-123456'
                    ),
                    sessionId: 'session-001'
                })
            ]
        });

        const failure = await provider
            .synthesizeSpeech({
                outputPath: join(outputDir, 'voice.mp3'),
                text: '智剪',
                voice: 'zh_female_gaolengyujie_uranus_bigtts'
            })
            .catch((error: unknown) => error);

        expect(failure).toBeInstanceOf(VolcengineTtsProviderError);
        expect((failure as Error).message).toContain('[REDACTED]');
        expect((failure as Error).message).not.toContain(
            'ark-sensitive-token-123456'
        );
    });
});

describe('IndexTts2Provider', () => {
    it('calls the local Gradio queue API and writes the generated wav', async () => {
        const outputDir = await mkdtemp(join(tmpdir(), 'app-indextts2-'));
        const sourcePath = join(outputDir, 'generated.wav');
        const referencePath = join(outputDir, 'reference.wav');
        const outputPath = join(outputDir, 'voice.mp3');
        const requestedUrls: string[] = [];
        const submittedBodies: unknown[] = [];
        let uploadBody: unknown;

        await writeFile(sourcePath, new Uint8Array([9, 8, 7]));
        await writeFile(referencePath, new Uint8Array([1, 2, 3]));

        const provider = new IndexTts2Provider({
            fetch: async (url, init) => {
                requestedUrls.push(String(url));

                if (String(url).endsWith('/gradio_api/upload')) {
                    uploadBody = init?.body;
                    expect(init?.method).toBe('POST');

                    return new Response(
                        JSON.stringify(['/tmp/gradio/uploaded-reference.wav']),
                        {
                            status: 200
                        }
                    );
                }

                if (String(url).endsWith('/gradio_api/call/gen_single')) {
                    submittedBodies.push(JSON.parse(String(init?.body)));

                    return new Response(
                        JSON.stringify({ event_id: 'event-001' }),
                        {
                            status: 200
                        }
                    );
                }

                return new Response(
                    [
                        'event: complete',
                        `data: {"visible":true,"value":{"path":"${sourcePath}"},"__type__":"update"}`,
                        ''
                    ].join('\n'),
                    {
                        status: 200
                    }
                );
            },
            probeDuration: async ({ filePath }) => {
                expect(filePath.endsWith('voice.wav')).toBe(true);

                return 2234;
            },
            resolveVoiceReferencePath: async (voiceId) => {
                expect(voiceId).toBe('voice_001');

                return referencePath;
            }
        });

        const result = await provider.synthesizeSpeech({
            outputPath,
            text: '同学们大家好，今天我们学习智能剪辑 Agent 开发。',
            voice: createCustomIndexTts2VoiceType('voice_001')
        });

        expect(requestedUrls).toEqual([
            'http://127.0.0.1:7860/gradio_api/upload',
            'http://127.0.0.1:7860/gradio_api/call/gen_single',
            'http://127.0.0.1:7860/gradio_api/call/gen_single/event-001'
        ]);
        expect(uploadBody).toBeInstanceOf(FormData);
        expect(submittedBodies[0]).toMatchObject({
            data: expect.arrayContaining([
                'Same as the voice reference',
                expect.objectContaining({
                    path: '/tmp/gradio/uploaded-reference.wav'
                }),
                '同学们大家好，今天我们学习智能剪辑 Agent 开发。'
            ])
        });
        expect([...new Uint8Array(await readFile(result.path))]).toEqual([
            9, 8, 7
        ]);
        expect(result).toMatchObject({
            byteLength: 3,
            durationMs: 2234,
            format: 'wav',
            path: join(outputDir, 'voice.wav')
        });
    });

    it('routes custom voices to IndexTTS2 and keeps built-in voices on the default provider', async () => {
        const calls: string[] = [];
        const provider = new RoutingTtsProvider({
            customProvider: {
                synthesizeSpeech: async (input) => {
                    calls.push(`custom:${input.voice}`);

                    return {
                        byteLength: 2,
                        durationMs: 1200,
                        format: 'wav',
                        path: input.outputPath.replace(/\.mp3$/i, '.wav')
                    };
                }
            },
            defaultProvider: {
                synthesizeSpeech: async (input) => {
                    calls.push(`default:${input.voice}`);

                    return {
                        byteLength: 1,
                        durationMs: 900,
                        format: 'mp3',
                        path: input.outputPath
                    };
                }
            }
        });

        await provider.synthesizeSpeech({
            outputPath: '/tmp/system.mp3',
            text: '系统音色',
            voice: 'zh_female_wenroushunv_uranus_bigtts'
        });
        await provider.synthesizeSpeech({
            outputPath: '/tmp/custom.mp3',
            text: '自定义音色',
            voice: createCustomIndexTts2VoiceType('voice_001')
        });

        expect(calls).toEqual([
            'default:zh_female_wenroushunv_uranus_bigtts',
            'custom:custom:index-tts2:voice_001'
        ]);
    });

    it('surfaces the IndexTTS2 server address when fetch fails', async () => {
        const outputDir = await mkdtemp(join(tmpdir(), 'app-indextts2-'));
        const referencePath = join(outputDir, 'reference.wav');

        await writeFile(referencePath, new Uint8Array([1, 2, 3]));

        const provider = new IndexTts2Provider({
            fetch: async () => {
                throw new TypeError('fetch failed', {
                    cause: new Error('connect ECONNREFUSED 127.0.0.1:7860')
                });
            },
            resolveVoiceReferencePath: async () => referencePath
        });

        const failure = await provider
            .synthesizeSpeech({
                outputPath: join(outputDir, 'voice.mp3'),
                text: '同学们大家好',
                voice: createCustomIndexTts2VoiceType('voice_001')
            })
            .catch((error: unknown) => error);

        expect(failure).toBeInstanceOf(Error);
        expect((failure as Error).message).toContain('IndexTTS2 请求失败');
        expect((failure as Error).message).toContain('http://127.0.0.1:7860');
        expect((failure as Error).message).toContain('ECONNREFUSED');
    });
});

describe('probeAudioDuration', () => {
    it('returns duration in milliseconds from ffprobe JSON output', async () => {
        const durationMs = await probeAudioDuration({
            execFile: async () => ({
                stderr: '',
                stdout: JSON.stringify({
                    format: {
                        duration: '1.234'
                    }
                })
            }),
            ffprobePath: 'ffprobe',
            filePath: '/tmp/voice.mp3'
        });

        expect(durationMs).toBe(1234);
    });

    it('serializes non-error values without leaking provider tokens', () => {
        expect(serializeError('failed ark-sensitive-token-123456')).toBe(
            'failed [REDACTED]'
        );
    });
});
