/* */
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

export type TtsProtocolSocket = {
    close: () => Promise<void> | void;
    receive: () => Promise<ArrayBuffer | ArrayBufferView | string>;
    send: (data: Uint8Array) => Promise<void> | void;
};
