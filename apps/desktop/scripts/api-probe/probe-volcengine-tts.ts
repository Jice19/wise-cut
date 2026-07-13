/* eslint-disable no-console */
/**
 * 火山方舟 Agent Plan TTS — 连通性 probe
 *
 * 协议:单流 TTS WebSocket
 *   wss://openspeech.bytedance.com/api/v3/plan/tts/unidirectional/stream
 *
 * Headers (必带,火山方舟控制台专属 API Key):
 *   X-Api-Key:        <TTS key>
 *   X-Api-Resource-Id: seed-tts-2.0         (固定,与 doubao-seed-tts-2.0 模型绑定)
 *   X-Api-Connect-Id: <uuid>                (本次连接 UUID)
 *   X-Api-Request-Id: <uuid>                (本次请求 UUID)
 *   X-Control-Require-Usage-Tokens-Return: "*"
 *
 * Body 帧(与 ASR 共享 binary framing,见 ./protocols.ts):
 *   [4B header] [4B seq BE] [4B size BE] [gzip(JSON payload)]
 *
 *   payload JSON:
 *     {
 *       "req_params": {
 *         "text": "...",
 *         "speaker": "zh_female_gaolengyujie_uranus_bigtts",
 *         "audio_params": { "format": "mp3", "sample_rate": 24000 }
 *       }
 *     }
 *
 * Server 回:
 *   - SERVER_AUDIO_RESPONSE 帧 (audio-only binary),直到 isLastPackage
 *   - SERVER_FULL_RESPONSE   帧 (JSON,可能含 usage 报告)
 *   - SERVER_ERROR_RESPONSE  帧 (错误)
 *
 * 输出:合并所有 audio 帧的 payload bytes 为单个 .mp3
 *   scripts/api-probe/.probe-out/tts.mp3
 *
 * 跑法:
 *   pnpm --filter @miaoma-magicut/desktop probe:tts
 *   pnpm --filter @miaoma-magicut/desktop probe:tts -- "文本内容"
 *   pnpm --filter @miaoma-magicut/desktop probe:tts -- "文本" "speaker"
 */

import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { config as loadDotenv } from 'dotenv';
import WebSocket from 'ws';

import {
    buildClientFrame,
    CompressionType,
    MessageTypeSpecificFlags,
    parseServerFrame,
    SerializationType
} from './protocols';

const __dirname = dirname(fileURLToPath(import.meta.url));

loadDotenv({ path: resolve(__dirname, '../../../../.env.local') });

const log = (...args: unknown[]) =>
    console.log(`[probe:tts ${new Date().toISOString()}]`, ...args);

const requireEnv = (key: string): string => {
    const value = process.env[key];
    if (!value) {
        throw new Error(`Missing env ${key} in .env.local`);
    }
    return value;
};

const DEFAULT_SPEAKER = 'zh_female_gaolengyujie_uranus_bigtts';
const DEFAULT_TEXT = '你好，欢迎使用语音合成服务。';

const DEFAULT_ENDPOINT =
    'wss://openspeech.bytedance.com/api/v3/plan/tts/unidirectional/stream';

type TtsConfig = {
    apiKey: string;
    endpoint: string;
    resourceId: string;
    sampleRate: number;
    speaker: string;
};

const loadConfig = (envOverrides: {
    speaker?: string;
}): {
    audioOutPath: string;
    config: TtsConfig;
    text: string;
} => {
    const apiKey = requireEnv('VOLCENGINE_TTS_API_KEY');
    const endpoint = process.env.TTS_BASE_URL ?? DEFAULT_ENDPOINT;
    const resourceId = process.env.TTS_RESOURCE_ID ?? 'seed-tts-2.0';
    const sampleRate = Number.parseInt(
        process.env.TTS_SAMPLE_RATE ?? '24000',
        10
    );
    const speaker = envOverrides.speaker ?? DEFAULT_SPEAKER;

    return {
        audioOutPath: resolve(__dirname, '.probe-out/tts.mp3'),
        config: {
            apiKey,
            endpoint,
            resourceId,
            sampleRate,
            speaker
        },
        text: DEFAULT_TEXT
    };
};

/**
 * 跑一次 TTS 合成,返回 base64 / raw bytes + usage 报告(如服务端返回)。
 */
const runTts = async ({
    config,
    text
}: {
    config: TtsConfig;
    text: string;
}): Promise<{ audio: Buffer; usage?: unknown }> => {
    const reqId = randomUUID();
    const headers = {
        'X-Api-Connect-Id': reqId,
        'X-Api-Key': config.apiKey,
        'X-Api-Request-Id': reqId,
        'X-Api-Resource-Id': config.resourceId,
        'X-Control-Require-Usage-Tokens-Return': '*'
    };

    log('tts.configured', {
        endpoint: config.endpoint,
        resourceId: config.resourceId,
        sampleRate: config.sampleRate,
        speaker: config.speaker,
        textLen: text.length
    });

    const payload = JSON.stringify({
        req_params: {
            audio_params: {
                format: 'mp3',
                sample_rate: config.sampleRate
            },
            speaker: config.speaker,
            text
        }
    });

    const frame = buildClientFrame(Buffer.from(payload, 'utf-8'), {
        compression: CompressionType.GZIP,
        flags: MessageTypeSpecificFlags.POS_SEQUENCE,
        sequence: 1,
        serialization: SerializationType.JSON
    });

    log('ws.connect', config.endpoint);
    const ws = new WebSocket(config.endpoint, {
        headers,
        handshakeTimeout: 15_000
    });

    const audioChunks: Buffer[] = [];
    let usage: unknown;
    let sawAudio = false;

    // 兼容两种结束协议:
    //   - server 在最后一帧 audio 上置 isLastPackage=true (flags bit 1)
    //   - server 关闭连接作为结束信号 (实务中更常见)
    const tryFinish = () => {
        if (sawAudio && !finishResolver.called) {
            finishResolver.called = true;
            finishResolver.resolve({
                audio: Buffer.concat(audioChunks),
                usage
            });
        }
    };

    const finishResolver: {
        called: boolean;
        resolve: (out: { audio: Buffer; usage?: unknown }) => void;
    } = {
        called: false,
        resolve: () => {
            /* reassigned after Promise constructed */
        }
    };

    const result = await new Promise<{
        audio: Buffer;
        usage?: unknown;
    }>((resolvePromise, reject) => {
        const finishOk = (out: { audio: Buffer; usage?: unknown }) => {
            ws.removeAllListeners();
            try {
                ws.close();
            } catch {
                /* noop */
            }
            resolvePromise(out);
        };
        const fail = (err: Error) => {
            ws.removeAllListeners();
            try {
                ws.terminate();
            } catch {
                /* noop */
            }
            reject(err);
        };

        finishResolver.resolve = finishOk;

        ws.on('open', () => {
            log('ws.open, sending full client request');
            ws.send(frame, { binary: true }, (sendErr) => {
                if (sendErr) {
                    fail(new Error(`ws.send failed: ${sendErr.message}`));
                }
            });
        });

        ws.on('message', (data, isBinary) => {
            if (!isBinary) {
                log('ws.text frame (unexpected, ignoring)');
                return;
            }
            const buf = data as Buffer;
            log('ws.raw-frame', {
                totalBytes: buf.length,
                firstBytesHex:
                    buf.length >= 4
                        ? Array.from(buf.subarray(0, Math.min(16, buf.length)))
                              .map((b) => b.toString(16).padStart(2, '0'))
                              .join(' ')
                        : '',
                lastBytesHex:
                    buf.length >= 4
                        ? Array.from(buf.subarray(Math.max(0, buf.length - 8)))
                              .map((b) => b.toString(16).padStart(2, '0'))
                              .join(' ')
                        : ''
            });
            let frame;
            try {
                frame = parseServerFrame(buf);
            } catch (err) {
                fail(err instanceof Error ? err : new Error(String(err)));
                return;
            }

            if (frame.messageType === 0b1011 /* SERVER_AUDIO_RESPONSE */) {
                sawAudio = true;
                audioChunks.push(frame.payloadBytes);
                log('ws.audio', {
                    chunkBytes: frame.payloadBytes.length,
                    isLast: frame.isLastPackage,
                    seq: frame.payloadSequence
                });
                if (frame.isLastPackage) {
                    finishOk({
                        audio: Buffer.concat(audioChunks),
                        usage
                    });
                }
            } else if (
                frame.messageType === 0b1001 /* SERVER_FULL_RESPONSE */
            ) {
                if (frame.payloadMsg && typeof frame.payloadMsg === 'object') {
                    const msg = frame.payloadMsg as Record<string, unknown>;
                    if ('usage' in msg) {
                        usage = msg.usage;
                    }
                    if ('audio' in msg || 'audio_bytes' in msg) {
                        // 非 binary 模式下 server 偶尔回 base64,降级处理
                        const b64 = msg.audio_bytes ?? msg.audio;
                        if (typeof b64 === 'string') {
                            audioChunks.push(Buffer.from(b64, 'base64'));
                            sawAudio = true;
                        }
                    }
                    log('ws.full-response', {
                        event: frame.event,
                        isLast: frame.isLastPackage,
                        payload: frame.payloadMsg
                    });
                    // 火山 TTS 单流:结束信号是 FINAL FULL_RESPONSE 携带 usage
                    // (audio 上的 isLast 字段 server 通常不置位)
                    const isSessionEnd =
                        frame.isLastPackage ||
                        (typeof usage !== 'undefined' && sawAudio) ||
                        frame.event === 159 /* EndSession? */ ||
                        ('is_last' in msg && msg.is_last === true) ||
                        ('session_end' in msg && msg.session_end === true) ||
                        ('finish' in msg && msg.finish === true);
                    if (isSessionEnd) {
                        finishOk({
                            audio: Buffer.concat(audioChunks),
                            usage
                        });
                    }
                } else {
                    log('ws.full-response-no-parse', {
                        event: frame.event,
                        isLast: frame.isLastPackage,
                        rawLen: frame.payloadBytes.length,
                        rawFirstChars: frame.payloadBytes
                            .subarray(
                                0,
                                Math.min(40, frame.payloadBytes.length)
                            )
                            .toString('utf-8')
                            .replace(/[^\x20-\x7e]/g, '·')
                    });
                }
            } else if (
                frame.messageType === 0b1111 /* SERVER_ERROR_RESPONSE */
            ) {
                const err = frame.payloadMsg as {
                    error_code: number;
                    message: string;
                } | null;
                fail(
                    new Error(
                        `TTS server error: code=${err?.error_code ?? '?'} message=${err?.message ?? '?'}`
                    )
                );
            } else {
                log('ws.unknown-frame', {
                    messageType: frame.messageType,
                    flags: frame.flags
                });
            }
        });

        ws.on('error', (err) => {
            fail(err instanceof Error ? err : new Error(String(err)));
        });

        ws.on('close', (code, reason) => {
            log('ws.close', {
                code,
                reason: reason.toString('utf-8') || '<empty>'
            });
            // 兜底:连接已关但没收到 isLast 也结束
            tryFinish();
        });
    });

    return result;
};

export const probeVolcengineTts = async ({
    text,
    speaker
}: {
    speaker?: string;
    text?: string;
}): Promise<void> => {
    const {
        audioOutPath,
        config,
        text: defaultText
    } = loadConfig({
        speaker
    });
    const finalText = text ?? defaultText;

    const { audio, usage } = await runTts({
        config,
        text: finalText
    });

    if (audio.length === 0) {
        throw new Error('TTS returned 0 audio bytes');
    }

    mkdirSync(dirname(audioOutPath), { recursive: true });
    writeFileSync(audioOutPath, audio);

    log('✅ TTS probe PASSED', {
        audioPath: audioOutPath,
        bytes: audio.length,
        usage
    });
};

// CLI 入口
if (process.argv[1] === fileURLToPath(import.meta.url)) {
    const text = process.argv[2];
    const speaker = process.argv[3];
    probeVolcengineTts({ speaker, text }).catch((err: unknown) => {
        console.error('[probe:tts] ❌ FAILED', err);
        process.exitCode = 1;
    });
}
