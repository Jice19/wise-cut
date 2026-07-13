# 流式 TTS 合成设计

> 简历描述:**接入火山引擎 WebSocket 流式协议,设计缓存层复用重复请求降低 API 成本;自动探测音频时长并对齐分镜时间线,减少人工对齐成本。**

---

## 1. 目标

把 `synthesize_voice` 节点从"批量串行调 TTS"优化成:

1. **WebSocket 流式接收** —— 首块音频早 200-500ms 到达,UI 可提前播/对齐
2. **请求缓存** —— 相同 (text, voice, speed) 复用上次结果,不重复计费
3. **自动时长探测 + 对齐** —— 配音时长自动对齐 `scene.endMs - scene.startMs`,用户不再手动拖时间线

---

## 2. 火山方舟 WebSocket 流式协议

### 2.1 协议栈(plan §0 / commit 1)

- URL: `wss://openspeech.bytedance.com/api/v3/plan/tts/unidirectional/stream`
- 认证: HTTP header `Authorization: Bearer; <APP_ID>,<token>` 或 `API-KEY`
- 消息帧: `[4B header][4B event][4B sessionIdLen+sessionId][4B payloadLen+payload]`
- 事件类型: `MsgType.FullClientRequest=0x1` / `MsgType.AudioOnlyServer=0xb` / `MsgType.SessionFinished`
- 结束信号: `event === SessionFinished (152)` —— 后续**不再有音频块**
- 流式特性:**服务端持续推 AudioOnlyServer 帧,每帧包含一段 mp3 字节**

### 2.2 流式 vs 非流式对比

|              | 非流式(当前)           | 流式(目标)                 |
| ------------ | ---------------------- | -------------------------- |
| 首块音频到达 | 等服务端合成完整个文本 | 200-500ms                  |
| 内存占用     | 整个 mp3 一次性在内存  | 边收边写盘                 |
| 中断响应     | 等服务器返回           | 客户端断开 WS 即可         |
| API 计费     | 整个文本算一次         | 整个文本算一次(流式不打折) |

**流式不降低单次成本**,但**首块延迟降低 90%**,对 UI 体验(配音生成时显示进度条)很关键。

---

## 3. 缓存层设计

### 3.1 缓存 key

```ts
type TtsCacheKey = `${string}::${string}::${number}::${number}`;
//           text::voice::speedRatio::volumeRatio
```

### 3.2 缓存 value

```ts
type TtsCacheEntry = {
    filePath: string; // 缓存的 mp3 文件路径
    byteLength: number;
    durationMs: number; // ffprobe 探测的音频时长
    cachedAt: number; // 缓存时间
    requestHash: string; // SHA256(text + voice + speed + volume),调试用
};
```

### 3.3 缓存存储

`userData/tts-cache/<sha256-hash-prefix>.json` + 同名 `.mp3`:

```
userData/
├── tts-cache/
│   ├── a1b2c3...a1b2c3.json   # 元数据
│   ├── a1b2c3...a1b2c3.mp3    # 音频
│   └── ...
```

**为什么存文件而不是内存**:TTS 输出通常 100KB-1MB 一个,内存 cache 占用大;文件 cache 启动不加载,需要时 stat + readFile 即可。

### 3.4 缓存命中算法

```ts
async function synthesizeVoice(
    input: TtsSynthesisInput
): Promise<TtsSynthesisResult> {
    const key = buildCacheKey(
        input.text,
        input.voice,
        input.speedRatio,
        input.volumeRatio
    );
    const hash = sha256(key).slice(0, 32);

    // 1. 查缓存
    const cached = await loadTtsCacheEntry(hash);
    if (cached && fs.existsSync(cached.filePath)) {
        // 命中:复用 mp3
        return {
            byteLength: cached.byteLength,
            durationMs: cached.durationMs,
            path: cached.filePath,
            format: 'mp3',
            fromCache: true // 调试 + 统计用
        };
    }

    // 2. 未命中:调 TTS,边收边写盘
    const result = await streamSynthesize(input, hash);

    // 3. 写缓存
    await saveTtsCacheEntry(hash, result);

    return result;
}
```

### 3.5 成本估算

| 场景                | TTS 调用次数 | API 成本                     |
| ------------------- | ------------ | ---------------------------- |
| 首次跑(6 个分镜)    | 6            | 6x 单价                      |
| regenerate 单分镜   | 1            | 1x                           |
| regenerate 单句配音 | 1            | 1x(但若文案未变,缓存命中 0x) |
| 重复跑同样 brief    | 0(全缓存)    | **0x**                       |

---

## 4. 自动时长探测 + 对齐

### 4.1 时长探测

TTS 流式收完最后一个字节后,跑 `ffprobe -show_format -print_format json` 拿真实时长:

```bash
ffprobe -v error -show_format -print_format json output.mp3
# output: { "format": { "duration": "4.231" } }
```

**早于本阶段 plan §0.2 提到的**:当前 `synthesize_voice` 节点没有自动对齐,用户在 editor 里手动拖时间线。本设计新增自动对齐。

### 4.2 对齐算法

```ts
async function alignVoicesToTimeline(
    voices: VoiceSynthesisResult[],
    scenes: PlannedScene[]
): Promise<AlignedVoiceSegment[]> {
    const result: AlignedVoiceSegment[] = [];
    let cursorMs = 0;

    for (let i = 0; i < voices.length; i++) {
        const voice = voices[i];
        const scene = scenes[i];
        const sceneDurationMs = scene.endMs - scene.startMs;

        // 如果配音时长 > 分镜时长,atemp 加速到匹配
        // 如果配音时长 < 分镜时长,加静音到匹配
        const alignedPath = await ffmpegAdjustDuration({
            inputPath: voice.path,
            targetDurationMs: sceneDurationMs,
            outputPath: `${voice.path}.aligned.mp3`
        });

        result.push({
            sceneId: scene.sceneId,
            filePath: alignedPath,
            durationMs: sceneDurationMs,
            startMs: cursorMs
        });

        cursorMs += sceneDurationMs;
    }

    return result;
}
```

### 4.3 ffmpeg 对齐命令

```bash
# 加速到目标时长
ffmpeg -i voice.mp3 -af "atempo=<speed>" -y voice.aligned.mp3

# 加静音到目标时长
ffmpeg -i voice.mp3 -af "apad=pad_dur=<seconds>" -y voice.aligned.mp3
```

`atempo` 单次限制 0.5~2.0,如果需要更极端的加速要串联。

### 4.4 边界

| 情况                        | 处理                          |
| --------------------------- | ----------------------------- |
| 配音时长 ≈ 分镜时长(±100ms) | 不对齐,直接使用               |
| 配音时长 > 分镜时长         | atempo 加速(>2x 用 apad 截断) |
| 配音时长 < 分镜时长         | apad 末尾加静音               |
| 单分镜时长 = 0              | emit warning,使用配音原长     |

---

## 5. 模块划分

### 5.1 新增

- `packages/video-agent/src/audio/tts-cache.ts` —— 缓存 key/value + 持久化
- `packages/video-agent/src/audio/probe-audio-duration.ts` —— ffprobe 探测 mp3 时长
- `packages/video-agent/src/audio/align-voice-to-scene.ts` —— 自动对齐算法
- `apps/desktop/client/tts-stream-cache.ts` —— 缓存目录管理

### 5.2 修改

- `apps/desktop/scripts/api-probe/providers/volcengine-tts-provider.ts` —— 加流式 API + 缓存集成(commit 1 已封装的升级)
- `packages/video-agent/src/graph/nodes.ts` —— `synthesize_voice` 节点调流式 + 缓存
- `packages/video-agent/src/graph/steps/synthesize-voice.ts` —— 节点步骤函数(新)

---

## 6. 测试矩阵

| 测试                                         | 覆盖                                           |
| -------------------------------------------- | ---------------------------------------------- |
| `streaming-tts.test.ts:cache-hit`            | 相同输入第二次调 → 复用 mp3,API 0 调用         |
| `streaming-tts.test.ts:cache-miss`           | 不同 voice → 不命中,新写缓存                   |
| `streaming-tts.test.ts:stream-first-byte`    | 流式收到第一块 mp3 字节 < 500ms                |
| `streaming-tts.test.ts:audio-duration-probe` | ffprobe 探测时长,误差 < 50ms                   |
| `streaming-tts.test.ts:align-stretch`        | 配音 3s → 分镜 5s,apad 加 2s 静音              |
| `streaming-tts.test.ts:align-shrink`         | 配音 5s → 分镜 3s,atempo 1.67x                 |
| `streaming-tts.test.ts:align-extreme`        | 配音 10s → 分镜 3s,atempo 3x 串联(2 次 1.73x)  |
| `streaming-tts.test.ts:align-equal`          | 配音 3s → 分镜 3s,跳过对齐                     |
| `streaming-tts.test.ts:cache-eviction`       | 缓存 > 100MB 时 LRU 清理                       |
| `streaming-tts.test.ts:cost-tracker`         | 模拟 6 场景 regenerate 同一 brief,只首次调 API |

---

## 7. 风险

1. **火山 WebSocket 流式稳定性**:长时间断流、SessionFinished 信号丢失。需要超时重连 + 半成品 mp3 检测(大小 < 阈值则丢弃)。
2. **缓存命中率低风险**:用户每次都改文案 → 缓存白存。补救:LRU + 最大 100MB 上限。
3. **ffprobe 探测延迟**:每次对齐前 ffprobe 跑 100ms,6 场景 = 600ms。可接受,但可以批量。
4. **atempo 音质损失**:连续 atempo 3x 会有可感知的失真。补救:降级为截断 + 加静音。
5. **缓存目录跨平台**:`userData` 路径 macOS/Windows/Linux 不同,但 `app.getPath('userData')` 内部已处理。
6. **缓存一致性**:同一 text 不同 voice → 不同 hash,符合预期;同一 text 同一 voice 但用户改了 speedRatio → 不同 hash,符合预期。

---

## 8. 引用清单

- **火山方舟 TTS WebSocket 协议** — `apps/desktop/scripts/api-probe/tts-protocol/`(commit 1 封装)
- **plan §0 协议格式** — `docs/plan-2.0-langgraph.md`
- **userData 路径** — Electron 官方 `app.getPath('userData')`
- **ffmpeg atempo filter** — https://ffmpeg.org/ffmpeg-filters.html#atempo
- **ffmpeg apad filter** — https://ffmpeg.org/ffmpeg-filters.html#apad
