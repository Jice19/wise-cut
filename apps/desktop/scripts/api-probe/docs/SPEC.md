# API Probe 封装方案 SPEC

> 范围:`apps/desktop/scripts/api-probe/` 下两个独立 probe —— LLM(MiniMax-M3 多模态)+ TTS(火山方舟 Agent Plan 单流 WebSocket)。
> 目标:复刻 `miaoma-magicut/packages/video-agent/src/providers/` 的 provider 抽象层设计,把这套调用模式沉淀到本仓可复用的封装里,probe 只是用这套封装的最小 demo。

---

## 1. 设计动机

直接面向 `fetch` / `ws` 写业务调用,会出现三类反复踩的坑:

1. **字节处理重复且易错** —— WebSocket 二进制 framing 在 probe 里手搓一遍,生产里再搓一遍,头几位偏移/序列化/事件名稍一变化就 silent bug。
2. **环境/配置散落各处** —— API key、endpoint、resource id、speaker、采样率塞在 if-else 里,改一个值要翻三处。
3. **缺少 provider 抽象** —— 上层业务(后续 Agent 调用)需要"在 N 家模型里选一家"的能力,但目前每个调用点都和底层协议耦合。

`miaoma-magicut` 的做法是把上述三点拆成三层:

- **协议层**(`tts-protocol/`)—— 二进制 framing 的纯函数,与具体传输无关
- **provider 层**(`*tts-provider.ts` / `*chat-model-provider.ts`)—— 把协议层套上 WebSocket / HTTP,加上鉴权头、错误处理、emit 事件
- **接口层**(`tts-provider.ts` / `model-provider.ts`)—— 业务侧只依赖 TypeScript interface,不依赖具体实现

我们这次复刻只做 protocol + provider 两层(接口层对应到 probe 的调用代码)。

---

## 2. 文件结构

```
apps/desktop/scripts/api-probe/
├── docs/SPEC.md                       ← 本文件
├── README.md                          ← 跑法
├── tsconfig.json
├── package.json (沿用根 workspace 的 deps)
│
├── tts-protocol/                      ← 协议层(纯函数,无 IO)
│   ├── types.ts                       ← MsgType / EventType / 枚举
│   ├── frame.ts                       ← createTtsMessageFrame / parseTtsMessageFrame
│   ├── full-client-request.ts         ← 全量请求 helper
│   ├── receive-message.ts             ← 接收 + 解析 helper
│   └── index.ts                       ← barrel
│
├── providers/                         ← provider 层(带 IO)
│   ├── volcengine-tts-provider.ts     ← 火山方舟 TTS(基于 ws + tts-protocol)
│   └── minimax-m3-chat-provider.ts    ← MiniMax-M3 多模态 chat(基于 fetch)
│
├── probe-volcengine-tts.ts            ← TTS probe(用 VolcengineTtsProvider)
└── probe-minimax-m3.ts                ← M3 probe(用 MinimaxM3ChatProvider)
```

---

## 3. 协议层:TTS binary framing

### 3.1 字节布局

```
┌──────────────────────────────────────────────────────────────────────┐
│ byte 0 │ byte 1             │ byte 2                  │ byte 3 │ ...
│ ver|hdr │ msgType|flag       │ serialization|compress  │ reserved│ event 4B │ sessionIdLen 4B │ sessionId N B │ errorCode 4B │ payloadLen 4B │ payload N B
└──────────────────────────────────────────────────────────────────────┘
```

- **byte 0**:高 4 位 = protocol version(0x1);低 4 位 = header 大小(以 4 字节为单位,本协议恒为 1 → 4 字节 header)
- **byte 1**:高 4 位 = `MsgType`(1=full req / 9=full resp / 0xb=audio-only resp / 0xf=error);低 4 位 = `MsgTypeFlag`(**恒为 0x4 WithEvent**)
- **byte 2**:高 4 位 = serialization(0=none / 1=json);低 4 位 = compression(本协议恒为 0)
- **byte 3**:保留位 0x00
- **event**(4B,大端 int32):事件号,本协议规定全部消息都带 event
- **sessionId**:仅当 event 是 session 类(100/101/102/150/151/152/153/200/350/351/352)时才出现,前面 4B 是长度
- **errorCode**(4B):仅 `MsgType.Error` 携带
- **payload**(N B):前面 4B 是长度,然后才是真正 payload

### 3.2 关键枚举

```ts
enum MsgType      { FullClientRequest=0x1, FullServerResponse=0x9, AudioOnlyServer=0xb, Error=0xf }
enum MsgTypeFlag  { NoSeq=0x0, WithEvent=0x4 }
enum EventType    {
    StartConnection=1, FinishConnection=2,
    ConnectionStarted=50, ConnectionFailed=51, ConnectionFinished=52,
    StartSession=100, FinishSession=102,
    SessionStarted=150, SessionFinished=152, SessionFailed=153,
    TaskRequest=200, TtsResponse=352,
    ...
}
```

### 3.3 与之前 probe 的关键差异

| 维度         | 之前的 probe           | 复刻后的协议层                                                   |
| ------------ | ---------------------- | ---------------------------------------------------------------- |
| 字节容器     | `Buffer`(Node 专属)    | `Uint8Array` + `DataView`(跨平台)                                |
| flags 默认值 | `POS_SEQUENCE`(bit 0)  | **`WithEvent=0x4`**(bit 2)                                       |
| payload 前缀 | 仅 4B size             | event + sessionId + size(条件出现)                               |
| 结束信号     | `isLastPackage` 标志位 | **`event === SessionFinished(152)`** 出现在 `FullServerResponse` |

### 3.4 API

```ts
// tts-protocol/frame.ts
createTtsMessageFrame({ msgType, event, sessionId?, payload, errorCode? }): Uint8Array
parseTtsMessageFrame(input: ArrayBuffer | ArrayBufferView | string): TtsProtocolMessage

// tts-protocol/full-client-request.ts
fullClientRequest(socket, payload, { sessionId? }): Promise<void>
//  内部构造 event=StartSession, msgType=FullClientRequest, 自动 uuid sessionId

// tts-protocol/receive-message.ts
receiveMessage(socket): Promise<TtsProtocolMessage>
//  内部调 socket.receive() 后 parseTtsMessageFrame
```

### 3.5 Socket 抽象

协议层不直接依赖 `ws`,而是定义最小接口:

```ts
type TtsProtocolSocket = {
    close(): Promise<void> | void;
    receive(): Promise<ArrayBuffer | ArrayBufferView | string>;
    send(data: Uint8Array): Promise<void> | void;
};
```

provider 层负责把这个接口适配到 `ws.WebSocket` 上,顺手处理:

- 消息缓冲队列 + 等待 receiver(FIFO 唤醒)
- 关闭/错误时把所有挂起的 receiver 拒绝掉
- `ws.send` 回调转 Promise

---

## 4. Provider 层

### 4.1 VolcengineTtsProvider

入参:

```ts
new VolcengineTtsProvider({
    apiKey: string,
    endpoint?: string,        // 默认 wss://openspeech.bytedance.com/.../unidirectional/stream
    resourceId?: string,      // 默认 seed-tts-2.0
    sampleRate?: number,      // 默认 24000
    format?: 'mp3',           // 默认 mp3
    speaker: string,
    connect?: SocketFactory,  // 可注入 fake socket 跑单测
})
```

调用:

```ts
const tts = new VolcengineTtsProvider({ apiKey, speaker: 'zh_female_...' });
const { audio, durationMs, path } = await tts.synthesizeSpeech({
    text: '你好',
    outputPath: '.probe-out/tts.mp3'
});
```

内部流程:

1. 拿 API key/resource id 拼 WebSocket headers(`X-Api-Key` / `X-Api-Resource-Id` / `X-Control-Require-Usage-Tokens-Return: '*'`)
2. `fullClientRequest(socket, jsonReq)` 发 payload JSON
3. 循环 `receiveMessage(socket)`:
    - `MsgType.Error` → 抛 VolcengineTtsProviderError(errorCode, payload)
    - `MsgType.FullServerResponse && event === SessionFinished(152)` → break
    - `MsgType.AudioOnlyServer && payload.byteLength > 0` → 累积到 chunks
4. `Buffer.concat(chunks)` → 写盘 → 用 ffprobe 探时长

`emit` 事件(可选):`tts.started` / `tts.chunk` / `tts.completed` / `tts.failed`,供上层 UI 进度展示。

### 4.2 MinimaxM3ChatProvider

> `miaoma-magicut` 把 LLM 套在 `@langchain/openai` 的 `ChatOpenAI` 上,目的是接 Zod 的 `withStructuredOutput`。
> 本仓不引入 LangChain(避免拖整个生态的依赖),自己写一个最小 provider,接口对齐 `ModelProvider` 形状。

入参:

```ts
new MinimaxM3ChatProvider({
    apiKey: string,
    baseUrl: string,          // 默认 https://api.minimaxi.com/v1
    model: string,            // 默认 MiniMax-M3
    timeoutMs?: number,       // 默认 60_000
})
```

调用:

```ts
const m3 = new MinimaxM3ChatProvider({ apiKey, baseUrl, model });

// 1) 多模态 chat(图 + 文字)
const text = await m3.chat({
    messages: [
        { role: 'user', content: [
            { type: 'text', text: '描述这张图' },
            { type: 'image_url', image_url: { url: dataUrl, detail: 'default' } }
        ]}
    ],
    maxTokens: 512,
});

// 2) 流式 chat(供 UI 打字机效果)
const fullText = await m3.streamChat({
    messages: [...],
    onDelta: (delta) => process.stdout.write(delta),
});
```

内部:

- `chat()`:HTTP POST `/chat/completions`,`stream: false`,返回 `choices[0].message.content`
- `streamChat()`:HTTP POST `/chat/completions`,`stream: true`,解析 SSE,逐 chunk 调 `onDelta`
- 错误处理:`response.ok === false` 时,把 status + body 前 500 字节一起抛

### 4.3 provider 接口

```ts
// providers/minimax-m3-chat-provider.ts
export class MinimaxM3ChatProvider {
    constructor(opts: {
        apiKey: string;
        baseUrl: string;
        model: string;
        timeoutMs?: number;
    });
    chat(input: ChatInput): Promise<string>;
    streamChat(
        input: ChatInput & { onDelta: (delta: string) => void | Promise<void> }
    ): Promise<string>;
}
```

---

## 5. Probe 脚本

两个 probe 文件现在只做"装载 .env.local → 读 CLI 参数 → 调 provider → 写文件"的薄壳,不再内嵌 framing / fetch 逻辑。

### 5.1 TTS probe

```ts
const tts = new VolcengineTtsProvider({
    apiKey: requireEnv('VOLCENGINE_TTS_API_KEY'),
    endpoint: process.env.TTS_BASE_URL,
    resourceId: process.env.TTS_RESOURCE_ID,
    speaker: argv[3] ?? 'zh_female_gaolengyujie_uranus_bigtts'
});
const result = await tts.synthesizeSpeech({
    text: argv[2] ?? '你好,欢迎使用语音合成服务。',
    outputPath: resolve('.probe-out/tts.mp3')
});
console.log(
    `✅ wrote ${result.path} (${result.byteLength} bytes, ${result.durationMs}ms)`
);
```

### 5.2 M3 probe

```ts
const m3 = new MinimaxM3ChatProvider({
    apiKey: requireEnv('API_KEY'),
    baseUrl: requireEnv('BASE_URL'),
    model: requireEnv('LLM_MODEL')
});
const dataUrl = fileToDataUrl(argv[2]);
const text = await m3.chat({
    messages: [
        {
            role: 'user',
            content: [
                { type: 'text', text: argv[3] ?? '请用 80 字内中文描述图片。' },
                {
                    type: 'image_url',
                    image_url: { url: dataUrl, detail: argv[4] ?? 'default' }
                }
            ]
        }
    ],
    maxTokens: 512
});
console.log(text);
```

---

## 6. 配置与凭据

读 `.env.local`(仓库根,gitignore)而非 hardcode。`.env.local` 必须已经包含:

```
LLM_MODEL=MiniMax-M3
BASE_URL=https://api.minimaxi.com/v1
API_KEY=<your minimax key>

TTS_BASE_URL=wss://openspeech.bytedance.com/api/v3/plan/tts/unidirectional/stream
TTS_RESOURCE_ID=seed-tts-2.0
VOLCENGINE_TTS_API_KEY=<your ark key>
```

probe 脚本里**严禁**出现任何真实 key 字面量,所有 key 通过 `requireEnv()` 从环境读取。

---

## 7. 验收标准

- [x] `pnpm probe:tts` 成功输出 `.probe-out/tts.mp3`,ffprobe 能读到时长
- [x] `pnpm probe:m3 <图片路径>` 成功在终端打印中文图片描述
- [x] 协议层 frame 编/解码 roundtrip 自洽(同 payload encode→decode 字节一致)
- [x] 复用 `miaoma-magicut` 的 `MsgType` / `EventType` 命名,**不再**使用 `POS_SEQUENCE` + `isLastPackage` 旧约定
- [x] `.env.local` 不会被 commit(`git status` 看不到)
- [x] 提交格式遵循 cz-git(emoji + type + scope + 小写 subject)
