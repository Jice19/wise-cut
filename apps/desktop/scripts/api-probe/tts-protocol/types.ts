/**
 * 火山方舟 Agent Plan TTS —— 二进制协议枚举。
 *
 * 字节布局(配合 frame.ts):
 *   byte 0 = (ProtocolVersion << 4) | header_size_words
 *   byte 1 = (MsgType             << 4) | MsgTypeFlag
 *   byte 2 = (SerializationType   << 4) | CompressionType
 *   byte 3 = reserved
 *   event (4B BE int32)
 *   [sessionIdLen 4B BE + sessionId N B]   (仅 session 类事件)
 *   [errorCode   4B BE int32]              (仅 MsgType.Error)
 *   payloadLen    4B BE int32 + payload N B
 *
 * 与 miaoma-magicut/packages/video-agent/src/providers/tts-protocol/types.ts
 * 1:1 对齐,数值与命名都不变。
 */

export enum MsgType {
    FullClientRequest = 0x1,
    FullServerResponse = 0x9,
    AudioOnlyServer = 0xb,
    Error = 0xf
}

export enum MsgTypeFlag {
    NoSeq = 0x0,
    WithEvent = 0x4
}

export enum SerializationType {
    None = 0x0,
    Json = 0x1
}

export enum CompressionType {
    None = 0x0
}

export enum EventType {
    StartConnection = 1,
    FinishConnection = 2,
    ConnectionStarted = 50,
    ConnectionFailed = 51,
    ConnectionFinished = 52,
    StartSession = 100,
    CancelSession = 101,
    FinishSession = 102,
    SessionStarted = 150,
    SessionCanceled = 151,
    SessionFinished = 152,
    SessionFailed = 153,
    TaskRequest = 200,
    TtsSentenceStart = 350,
    TtsSentenceEnd = 351,
    TtsResponse = 352
}

export type TtsProtocolMessage = {
    errorCode?: number;
    event?: EventType;
    msgType: MsgType;
    payload: Uint8Array;
    sessionId?: string;
};

/**
 * 协议层与具体传输无关的最小 socket 抽象。
 * provider 层负责把它适配到 ws.WebSocket。
 */
export type TtsProtocolSocket = {
    close: () => Promise<void> | void;
    receive: () => Promise<ArrayBuffer | ArrayBufferView | string>;
    send: (data: Uint8Array) => Promise<void> | void;
};
