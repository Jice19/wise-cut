/**
 * TTS 帧编/解码。
 *
 * 使用 Uint8Array + DataView(浏览器/Node 通用),不复用 Node Buffer。
 * 默认 MsgTypeFlag.WithEvent(0x4) —— 与 miaoma-magicut 一致;这是字节 1 的低 4 位。
 */

import {
    CompressionType,
    EventType,
    MsgType,
    MsgTypeFlag,
    SerializationType,
    type TtsProtocolMessage
} from './types';

const PROTOCOL_VERSION = 0x1;
const HEADER_SIZE_IN_WORDS = 0x1;
const BASE_HEADER_SIZE = 4;

const textEncoder = new TextEncoder();

const isSessionEvent = (event: EventType | undefined): boolean =>
    Boolean(
        event &&
            ![
                EventType.StartConnection,
                EventType.FinishConnection,
                EventType.ConnectionStarted,
                EventType.ConnectionFailed,
                EventType.ConnectionFinished
            ].includes(event)
    );

const toUint8Array = (
    value: ArrayBuffer | ArrayBufferView | string
): Uint8Array => {
    if (typeof value === 'string') {
        return textEncoder.encode(value);
    }

    if (value instanceof ArrayBuffer) {
        return new Uint8Array(value);
    }

    return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
};

const writeInt32 = (value: number): Uint8Array => {
    const output = new Uint8Array(4);
    const view = new DataView(output.buffer);
    view.setInt32(0, value);
    return output;
};

const readInt32 = (data: Uint8Array, offset: number): number => {
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    return view.getInt32(offset);
};

const writeBytes = (bytes: Uint8Array): Uint8Array => {
    const output = new Uint8Array(4 + bytes.byteLength);
    output.set(writeInt32(bytes.byteLength), 0);
    output.set(bytes, 4);
    return output;
};

const writeString = (value: string): Uint8Array =>
    writeBytes(textEncoder.encode(value));

const concat = (parts: Uint8Array[]): Uint8Array => {
    const totalLength = parts.reduce((sum, part) => sum + part.byteLength, 0);
    const output = new Uint8Array(totalLength);
    let offset = 0;

    for (const part of parts) {
        output.set(part, offset);
        offset += part.byteLength;
    }

    return output;
};

/**
 * 把一个协议消息编码成完整二进制帧。
 *
 * 默认:
 *   - flags = WithEvent(0x4)
 *   - serialization: client 用 JSON,server 用 None
 *   - compression: None(本协议恒为 0)
 */
export const createTtsMessageFrame = ({
    errorCode,
    event,
    msgType,
    payload,
    sessionId
}: TtsProtocolMessage): Uint8Array => {
    const serialization =
        msgType === MsgType.FullClientRequest
            ? SerializationType.Json
            : SerializationType.None;
    const bodyParts: Uint8Array[] = [];

    if (event) {
        bodyParts.push(writeInt32(event));
    }

    if (isSessionEvent(event)) {
        bodyParts.push(writeString(sessionId ?? ''));
    }

    if (msgType === MsgType.Error) {
        bodyParts.push(writeInt32(errorCode ?? 0));
    }

    bodyParts.push(writeBytes(payload));

    return concat([
        new Uint8Array([
            (PROTOCOL_VERSION << 4) | HEADER_SIZE_IN_WORDS,
            (msgType << 4) | MsgTypeFlag.WithEvent,
            (serialization << 4) | CompressionType.None,
            0
        ]),
        ...bodyParts
    ]);
};

/**
 * 从一段二进制消息解析出协议消息。
 *
 * 输入可以是 ArrayBuffer / ArrayBufferView / 字符串(文本帧)——
 * 字符串会被当作 UTF-8 编码,但通常本协议只用 binary 帧。
 */
export const parseTtsMessageFrame = (
    input: ArrayBuffer | ArrayBufferView | string
): TtsProtocolMessage => {
    const data = toUint8Array(input);

    if (data.byteLength < BASE_HEADER_SIZE) {
        throw new Error('TTS protocol message is missing its base header');
    }

    const headerSize = (data[0] & 0x0f) * 4;
    const msgType = (data[1] >> 4) as MsgType;
    const flag = data[1] & 0x0f;
    let offset = headerSize;
    let event: EventType | undefined;
    let sessionId: string | undefined;
    let errorCode: number | undefined;

    if (flag === MsgTypeFlag.WithEvent) {
        event = readInt32(data, offset) as EventType;
        offset += 4;
    }

    if (isSessionEvent(event)) {
        const sessionIdLength = readInt32(data, offset);
        offset += 4;
        sessionId = new TextDecoder().decode(
            data.subarray(offset, offset + sessionIdLength)
        );
        offset += sessionIdLength;
    }

    if (msgType === MsgType.Error) {
        errorCode = readInt32(data, offset);
        offset += 4;
    }

    const payloadLength = readInt32(data, offset);
    offset += 4;

    return {
        errorCode,
        event,
        msgType,
        payload: data.slice(offset, offset + payloadLength),
        sessionId
    };
};
