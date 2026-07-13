/**
 * 火山方舟 Agent Plan 语音模型 — WebSocket 字节流协议 (TS 版)。
 *
 * 镜像官方 Python `protocols.py` 的二进制 framing:
 *   byte 0 = (ProtocolVersion << 4) | header_size_words  (低 4 位是 header 长度,以 4 字节为单位)
 *   byte 1 = (message_type        << 4) | message_type_specific_flags
 *   byte 2 = (serialization_type  << 4) | compression_type
 *   byte 3 = reserved
 *
 * payload 段(可选,取决于 header 的 flags):
 *   - POS_SEQUENCE / NEG_WITH_SEQUENCE (flags bit 0) → payload 前缀: 4 字节 big-endian int sequence
 *   - bit 2 (0x04)                       → payload 前缀: 4 字节 event 字段(客户端基本不用)
 *   - payload_size (4 字节 big-endian int,后面接 size 字节)
 *
 * Server 响应 (同套 framing):
 *   - message_type = 0b1001 (SERVER_FULL_RESPONSE)   → JSON 状态/事件
 *   - message_type = 0b1011 (SERVER_AUDIO_RESPONSE)  → binary 音频字节直接是 payload
 *   - message_type = 0b1111 (SERVER_ERROR_RESPONSE)  → 头部后是 code(4 字节) + payload_size(4 字节) + msg
 *
 * 参考 ASR 文档里 ProtocolVersion/MessageType/SerializationType/CompressionType 的字节位定义。
 * 本文件为 probe + 后续生产代码提供统一个底层 framing 实现。
 */

import { gunzipSync, gzipSync } from 'node:zlib';

/* ────────── framing 常量 (来自官方 Python AsrRequestHeader / ResponseParser) ────────── */

export const ProtocolVersion = {
    V1: 0b0001
} as const;

export const MessageType = {
    CLIENT_FULL_REQUEST: 0b0001,
    CLIENT_AUDIO_ONLY_REQUEST: 0b0010,
    SERVER_FULL_RESPONSE: 0b1001,
    SERVER_AUDIO_RESPONSE: 0b1011,
    SERVER_ERROR_RESPONSE: 0b1111
} as const;

export const MessageTypeSpecificFlags = {
    NO_SEQUENCE: 0b0000,
    POS_SEQUENCE: 0b0001,
    NEG_SEQUENCE: 0b0010,
    NEG_WITH_SEQUENCE: 0b0011
} as const;

export const SerializationType = {
    NO_SERIALIZATION: 0b0000,
    JSON: 0b0001
} as const;

export const CompressionType = {
    NONE: 0b0000,
    GZIP: 0b0001
} as const;

/* ────────── client request header 构造 ────────── */

export type ClientHeaderInput = {
    messageType?: number;
    flags?: number;
    serialization?: number;
    compression?: number;
};

/**
 * 拼接 4 字节 client header。多数场景用默认:full request + JSON + gzip。
 */
export const buildClientHeader = ({
    messageType = MessageType.CLIENT_FULL_REQUEST,
    flags = MessageTypeSpecificFlags.POS_SEQUENCE,
    serialization = SerializationType.JSON,
    compression = CompressionType.GZIP
}: ClientHeaderInput = {}): Buffer => {
    const b0 = (ProtocolVersion.V1 << 4) | 0b0001; // header 长度 1 word = 4 bytes
    const b1 = (messageType << 4) | flags;
    const b2 = (serialization << 4) | compression;
    const b3 = 0x00;
    return Buffer.from([b0, b1, b2, b3]);
};

/**
 * 拼一个完整的 client frame: header + 4 字节 sequence + 4 字节 payload size + payload body。
 *
 * - payload 已序列化(JSON 字符串/二进制字节均可)
 * - 自动按 compression 决定是否对 body 做 gzip
 */
export const buildClientFrame = (
    payload: Buffer,
    options: {
        compression?: CompressionType;
        flags?: number;
        messageType?: number;
        sequence: number;
        serialization?: SerializationType;
    }
): Buffer => {
    const compression = options.compression ?? CompressionType.GZIP;
    const flags = options.flags ?? MessageTypeSpecificFlags.POS_SEQUENCE;
    const header = buildClientHeader({
        compression,
        flags,
        messageType: options.messageType ?? MessageType.CLIENT_FULL_REQUEST,
        serialization: options.serialization ?? SerializationType.JSON
    });

    const body =
        compression === CompressionType.GZIP ? gzipSync(payload) : payload;

    const seqBuf = Buffer.alloc(4);
    seqBuf.writeInt32BE(options.sequence, 0);

    const sizeBuf = Buffer.alloc(4);
    sizeBuf.writeUInt32BE(body.length, 0);

    return Buffer.concat([header, seqBuf, sizeBuf, body]);
};

/* ────────── server response 解析 ────────── */

export type ParsedFrame = {
    messageType: number;
    flags: number;
    serialization: number;
    compression: number;
    event: number;
    isLastPackage: boolean;
    payloadSequence: number;
    payloadSize: number;
    /** JSON 解析后的对象(SERVER_FULL_RESPONSE 用) */
    payloadMsg: unknown;
    /** 解压后的 raw payload bytes(audio frame 用) */
    payloadBytes: Buffer;
};

/**
 * 解析一段 server 帧(从 header 起,长度由 header 的低 4 位 * 4 决定)。
 *
 * 行为对齐官方 ResponseParser.parse_response,但 audio 帧直接返回 raw bytes,
 * 由调用方负责拼接。
 */
export const parseServerFrame = (msg: Buffer): ParsedFrame => {
    if (msg.length < 4) {
        throw new Error(`frame too short: ${msg.length} bytes`);
    }

    const headerSizeWords = msg[0] & 0x0f;
    const headerSize = headerSizeWords * 4;

    const messageType = msg[1] >> 4;
    const flags = msg[1] & 0x0f;
    const serialization = msg[2] >> 4;
    const compression = msg[2] & 0x0f;

    let offset = headerSize;

    const frame: ParsedFrame = {
        compression,
        event: 0,
        flags,
        isLastPackage: false,
        payloadBytes: Buffer.alloc(0),
        payloadMsg: null,
        payloadSequence: 0,
        payloadSize: 0,
        messageType
    };

    // flags bit 0 = POS_SEQUENCE / NEG_WITH_SEQUENCE → 4 字节 seq
    if (flags & 0x01) {
        if (msg.length < offset + 4) {
            throw new Error('frame truncated at sequence');
        }
        frame.payloadSequence = msg.readInt32BE(offset);
        offset += 4;
    }
    // flags bit 1 = NEG → last package
    if (flags & 0x02) {
        frame.isLastPackage = true;
    }
    // flags bit 2 = event 字段 (一般 server 才会用)
    if (flags & 0x04) {
        if (msg.length < offset + 4) {
            throw new Error('frame truncated at event');
        }
        frame.event = msg.readInt32BE(offset);
        offset += 4;
    }

    if (messageType === MessageType.SERVER_AUDIO_RESPONSE) {
        // audio-only: header(4B) + 可选 seq + 可选 event 之后,余下字节全是 mp3
        frame.payloadSize = Math.max(0, msg.length - offset);
        frame.payloadBytes = msg.subarray(offset);
    } else if (messageType === MessageType.SERVER_FULL_RESPONSE) {
        // 实测线上 FULL_RESPONSE layout (TTS 单流):
        //   [4B header] [4B event] [4B size LE/BE? ] [size bytes json]
        // size 字段在前 4 个 payload 字节(读作 uint32,大端);
        // 紧跟 size 字节的 JSON body。
        if (msg.length < offset + 4) {
            throw new Error('full frame truncated at size');
        }
        frame.payloadSize = msg.readUInt32BE(offset);
        offset += 4;

        let body = msg.subarray(offset, offset + frame.payloadSize);
        if (compression === CompressionType.GZIP) {
            try {
                body = gunzipSync(body);
            } catch {
                /* keep raw bytes; downstream handles */
            }
        }
        frame.payloadBytes = body;
        if (serialization === SerializationType.JSON) {
            try {
                frame.payloadMsg = JSON.parse(body.toString('utf-8'));
            } catch {
                /* leave as null */
            }
        }
    } else if (messageType === MessageType.SERVER_ERROR_RESPONSE) {
        // ERROR: 余下字节 = msg 文本(可能 gzip)
        let body = msg.subarray(offset);
        if (compression === CompressionType.GZIP) {
            try {
                body = gunzipSync(body);
            } catch {
                /* keep raw bytes */
            }
        }
        const decoded = body.toString('utf-8');
        let errorMsg: unknown = decoded;
        // 试着 JSON parse
        try {
            errorMsg = JSON.parse(decoded);
        } catch {
            /* keep string */
        }
        frame.payloadSize = body.length;
        frame.payloadBytes = body;
        frame.payloadMsg = { error_code: 0, message: errorMsg };
    }

    return frame;
};
