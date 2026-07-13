# 多字幕路径设计

> 范围:Phase 4+ 接入,本阶段(commit 6)只实现 **TTS 路径**,ASR / 纯文本作为可选扩展。
>
> 设计目标:支持 **3 条字幕生成路径**,用户根据场景选:
>
> - **TTS 路径**(默认):LLM 旁白 + 火山 TTS 配音,**字幕 = narration**
> - **ASR 路径**:用户原视频自带音轨,**识别音轨生成字幕**
> - **纯文本路径**:用户手写 SRT,直接用

---

## 1. 目标

把"字幕怎么来"从 assembleTimeline 节点剥出来,做成可插拔的 `SubtitleGenerator` 抽象层。

### 当前

| 路径                 | 状态                    |
| -------------------- | ----------------------- |
| TTS(LLM 旁白 → 字幕) | ❌ commit 6 才会接      |
| ASR(视频音轨 → 字幕) | ❌ 本阶段不实现,Phase 5 |
| 纯文本(用户 SRT)     | ❌ 本阶段不实现         |

### 上线后

| 路径   | 用户场景                             |
| ------ | ------------------------------------ |
| TTS    | AI 控制叙事节奏(plan §3 默认路径)    |
| ASR    | 用户原始视频自带解说/对话,只想加字幕 |
| 纯文本 | 用户已有 SRT 文件,直接导入           |

---

## 2. 抽象接口

```ts
// packages/video-agent/src/audio/subtitle-generator.ts
export type SubtitleSegment = {
    segmentId: string; // 全局唯一
    text: string; // 单条字幕文字
    startMs: number;
    endMs: number;
    speaker?: string; // ASR 路径用,标识说话人
    confidence?: number; // ASR 路径用,0-1
};

export type SubtitleResult = {
    segments: SubtitleSegment[];
    format: 'srt' | 'vtt' | 'ass';
    rawContent: string; // SRT 文件原始内容
    generator: 'tts' | 'asr' | 'manual';
    totalDurationMs: number;
};

export interface SubtitleGenerator {
    readonly generatorName: 'tts' | 'asr' | 'manual';

    /**
     * 生成字幕。
     * 入参按 generator 不同而不同:
     *  - tts: { scenes, audioSegments? }
     *  - asr: { audioFilePath }
     *  - manual: { srtContent }
     */
    generate(input: any): Promise<SubtitleResult>;
}
```

### 工厂

```ts
// packages/video-agent/src/audio/subtitle-generator-factory.ts
export const createSubtitleGenerator = (
    type: 'tts' | 'asr' | 'manual'
): SubtitleGenerator => {
    switch (type) {
        case 'tts':
            return new TtsSubtitleGenerator();
        case 'asr':
            return new AsrSubtitleGenerator(); // Phase 5
        case 'manual':
            return new ManualSubtitleGenerator();
    }
};
```

---

## 3. 路径 1:TTS(默认,commit 6 落地)

### 3.1 算法

把 `scene.narration` 拆成多个 `SubtitleSegment`,时间戳对齐 `scene.startMs / scene.endMs`:

```ts
// packages/video-agent/src/audio/tts-subtitle-generator.ts
export const ttsSubtitleGenerator: SubtitleGenerator = {
    generatorName: 'tts',

    async generate({
        scenes
    }: {
        scenes: PlannedScene[];
    }): Promise<SubtitleResult> {
        const segments: SubtitleSegment[] = [];
        let segmentIdx = 0;

        for (const scene of scenes) {
            // 拆句:按中文标点(。！？)拆成多行字幕
            const lines = splitNarrationToLines(scene.narration, {
                maxChars: 25
            });
            const lineDurationMs = (scene.endMs - scene.startMs) / lines.length;

            for (let i = 0; i < lines.length; i++) {
                segments.push({
                    segmentId: `${scene.sceneId}-s${++segmentIdx}`,
                    text: lines[i],
                    startMs: Math.round(scene.startMs + i * lineDurationMs),
                    endMs: Math.round(scene.startMs + (i + 1) * lineDurationMs),
                    speaker: 'narrator',
                    confidence: 1.0 // TTS 路径确定
                });
            }
        }

        return {
            segments,
            format: 'srt',
            rawContent: serializeSrt(segments),
            generator: 'tts',
            totalDurationMs: scenes.at(-1)?.endMs ?? 0
        };
    }
};
```

### 3.2 拆句算法

```ts
function splitNarrationToLines(
    narration: string,
    opts: { maxChars: number }
): string[] {
    // 优先按标点拆,其次按 maxChars
    const lines: string[] = [];
    let buffer = '';

    for (const char of narration) {
        buffer += char;

        if ('。！？!?'.includes(char) || buffer.length >= opts.maxChars) {
            lines.push(buffer.trim());
            buffer = '';
        }
    }

    if (buffer.trim()) {
        lines.push(buffer.trim());
    }

    return lines.filter((l) => l.length > 0);
}
```

### 3.3 SRT 序列化

```ts
function serializeSrt(segments: SubtitleSegment[]): string {
    return segments
        .map((seg, i) => {
            const start = formatTimestamp(seg.startMs);
            const end = formatTimestamp(seg.endMs);
            return `${i + 1}\n${start} --> ${end}\n${seg.text}\n`;
        })
        .join('\n');
}

function formatTimestamp(ms: number): string {
    const h = Math.floor(ms / 3600000)
        .toString()
        .padStart(2, '0');
    const m = Math.floor((ms % 3600000) / 60000)
        .toString()
        .padStart(2, '0');
    const s = Math.floor((ms % 60000) / 1000)
        .toString()
        .padStart(2, '0');
    const millis = (ms % 1000).toString().padStart(3, '0');
    return `${h}:${m}:${s},${millis}`;
}
```

### 3.4 与 TTS 流式合成的集成

`streaming-tts.md` 已经定义了 TTS 缓存 + 时长对齐。本路径字幕的 text 直接来自 `scene.narration`,**不需要 ASR**,所以是最简单的路径。

---

## 4. 路径 2:ASR(Phase 5)

### 4.1 算法(规划)

```ts
// packages/video-agent/src/audio/asr-subtitle-generator.ts
export const asrSubtitleGenerator: SubtitleGenerator = {
    generatorName: 'asr',

    async generate({
        audioFilePath
    }: {
        audioFilePath: string;
    }): Promise<SubtitleResult> {
        // 1. 提取音频(若输入是视频)
        const audioPath = await extractAudioIfNeeded(audioFilePath);

        // 2. VAD 切段(silero-vad 或 ffmpeg silencedetect)
        const segments = await vadSegment(audioPath);

        // 3. 逐段调 ASR
        const transcripts = await Promise.all(
            segments.map((seg) =>
                asrProvider.transcribe({
                    audioPath: audioPath,
                    startMs: seg.startMs,
                    endMs: seg.endMs
                })
            )
        );

        // 4. 合并 + 输出 SRT
        const finalSegments = transcripts.map((t, i) => ({
            segmentId: `asr-s${i + 1}`,
            text: t.text,
            startMs: segments[i].startMs,
            endMs: segments[i].endMs,
            speaker: t.speaker,
            confidence: t.confidence
        }));

        return {
            segments: finalSegments,
            format: 'srt',
            rawContent: serializeSrt(finalSegments),
            generator: 'asr',
            totalDurationMs: segments.at(-1)?.endMs ?? 0
        };
    }
};
```

### 4.2 ASR Provider 选型(Phase 5 决策)

| ASR Provider    | 优点                   | 缺点          |
| --------------- | ---------------------- | ------------- |
| 火山 ASR        | 跟 TTS 同厂商,API 一致 | 中文一般      |
| OpenAI Whisper  | 开源,可自部署,多语言   | 自部署需 GPU  |
| 阿里 Paraformer | 中文好,中文场景首选    | 商用贵        |
| 字节豆包 ASR    | 中文好,字节生态        | 新模型,文档少 |

**Phase 5 推荐**:Whisper(本地) + Paraformer(线上)双 Provider。

### 4.3 说话人分离(diarization)

ASR 路径**需要说话人分离**(多说话人场景):

```
[00:00:00] 说话人 A:大家好,欢迎来到...
[00:00:05] 说话人 B:今天我们讨论...
```

需要额外调用 pyannote-audio 等模型。**Phase 5 评估**,本阶段 skip。

---

## 5. 路径 3:纯文本(用户手写)

### 5.1 算法

```ts
// packages/video-agent/src/audio/manual-subtitle-generator.ts
export const manualSubtitleGenerator: SubtitleGenerator = {
    generatorName: 'manual',

    async generate({
        srtContent
    }: {
        srtContent: string;
    }): Promise<SubtitleResult> {
        // 解析 SRT 字符串 → SubtitleSegment[]
        const segments = parseSrt(srtContent);

        return {
            segments,
            format: 'srt',
            rawContent: srtContent,
            generator: 'manual',
            totalDurationMs: segments.at(-1)?.endMs ?? 0
        };
    }
};
```

### 5.2 用户场景

- 用户已有 SRT 文件(从其他软件导出)
- 用户想完全控制字幕文案(不依赖 LLM)
- 用户做无 AI 的纯本地剪辑

### 5.3 UI

`/create` 页面提供"导入 SRT"按钮,接受 `.srt` 文件,解析 + 展示预览。

---

## 6. assembleTimeline 集成

### 6.1 调用接口

```ts
// packages/video-agent/src/audio/subtitle-in-assemble.ts
export async function assembleWithSubtitle({
  scenes,                  // TTS 路径用
  audioFilePath,           // ASR 路径用
  srtContent,              // 手动路径用
  generatorType,           // 'tts' | 'asr' | 'manual'
  videoSegments            // 待拼接的视频
}): Promise<AssembleResult> {
  // 1. 生成字幕
  const generator = createSubtitleGenerator(generatorType);
  const subtitle = await generator.generate({
    scenes, audioFilePath, srtContent
  });

  // 2. 写 SRT 到临时文件(供 ffmpeg subtitles filter 用)
  const srtPath = path.join(tempDir, 'subtitle.srt');
  await writeFile(srtPath, subtitle.rawContent, 'utf-8');

  // 3. ffmpeg filter_complex 加 subtitle filter
  const command = buildExportCommand({
    videoSegments,
    subtitlePath: srtPath,
    subtitleStyle: defaultStyle
  });

  // 4. 执行 + 清理临时 SRT
  await runExport(command);
  await rm(srtPath);

  return { subtitlePath: srtPath, ... };
}
```

### 6.2 ffmpeg 字幕烧录

详见 `assemble-and-subtitle.md` §4,这里不重复。

---

## 7. UI 集成

### 7.1 字幕路径选择器

`/create` 页面,brief 表单附近:

```
字幕来源:
  ◉ 自动生成(LMM 旁白 = 字幕)        ← 默认
  ○ 识别视频音轨(ASR)
  ○ 导入 SRT 文件

[选择后显示对应配置 UI]
```

### 7.2 ASR 路径的额外 UI

```
选择视频: [▼ 我的原视频.mp4]
识别语言: [▼ 中文 / English / 自动检测]
说话人分离: [ ] 启用
[开始识别]  ← 点击触发 ASR
```

### 7.3 纯文本路径 UI

```
[拖拽 SRT 文件到这里 / 点击选择文件]
预览:
  1
  00:00:00,000 --> 00:00:03,500
  这是第一句字幕
  ...
```

---

## 8. 模块划分

### 8.1 新增(`packages/video-agent/src/audio/`)

- `subtitle-generator.ts` —— 接口 + factory
- `tts-subtitle-generator.ts` —— TTS 路径(commit 6)
- `asr-subtitle-generator.ts` —— ASR 路径(Phase 5)
- `manual-subtitle-generator.ts` —— 手动路径(Phase 5)
- `srt.ts` —— SRT 序列化/解析工具函数

### 8.2 修改

- `packages/video-agent/src/graph/nodes.ts` —— `assembleTimeline` 节点按 generatorType 分支
- `packages/video-agent/src/index.ts` —— barrel 暴露 SubtitleGenerator
- `packages/video-project/src/schema.ts` —— `VideoProject.assets.subtitles: SubtitleSegment[]`

---

## 9. 测试矩阵

| 测试                                     | 覆盖                                 |
| ---------------------------------------- | ------------------------------------ |
| `tts-subtitle.test.ts:basic`             | 6 个场景,每个 1-3 句字幕             |
| `tts-subtitle.test.ts:long-line-split`   | narration > 25 字自动拆              |
| `tts-subtitle.test.ts:srt-format`        | 输出符合 SRT 格式(能被 ffmpeg 读)    |
| `asr-subtitle.test.ts:audio-extract`     | 视频输入 → 抽音频 → 调 ASR(集成测试) |
| `asr-subtitle.test.ts:multiple-speakers` | 说话人分离                           |
| `manual-subtitle.test.ts:parse-srt`      | SRT 字符串解析                       |
| `manual-subtitle.test.ts:malformed-srt`  | 损坏 SRT → 报错友好                  |
| `subtitle-factory.test.ts:type-dispatch` | 工厂按 type 返回对应实现             |
| `assemble-with-subtitle.test.ts:full`    | TTS 路径 + ffmpeg 烧录端到端         |

---

## 10. 风险

1. **ASR 准确率**:中英文混合 / 行业术语 / 多人对话场景,ASR 错误率高。补救:字幕置信度 < 0.7 时 UI 标黄,用户手动修正。
2. **时间戳对齐**:ASR 给的 word-level 时间戳和 VAD 切段不一致。补救:VAD 切段后再调 ASR,避免时间戳错位。
3. **SRT 编码**:中文字幕必须 UTF-8 with BOM(ffmpeg subtitles filter 旧版本兼容)。补救:统一用 UTF-8,验证 ffmpeg 版本 > 4.x。
4. **字幕长度规范**:中文字幕每行不超过 25 字(plan §15.2 D2),超长拆句可能破坏语义。补救:LLM 在 plan_scenes 阶段就生成 `subtitleLines` 字段,而不是事后拆。
5. **多字幕源冲突**:用户 TTS 路径 + ASR 路径同时生成 → 字幕叠加。补救:UI 强制单选 + assemble 节点 reject 多 source。
6. **手动 SRT 编辑回写**:用户在 UI 改 SRT 内容 → 持久化到 project.json → 后续 regenerateScene 不覆盖。补救:manual 路径独立字段 `manualSrtContent`,assemble 优先用。

---

## 11. 引用清单

- **assemble + 字幕烧录** — `docs/assemble-and-subtitle.md`
- **流式 TTS + 缓存** — `docs/streaming-tts.md`
- **scene-regeneration 局部改文案** — `docs/scene-regeneration.md`
- **plan §5 VideoProject assets.subtitles** — `docs/plan-2.0-langgraph.md`
- **SRT 格式** — https://www.matroska.org/technical/subtitles.html#srt-subtitles
- **Whisper** — https://github.com/openai/whisper
- **Paraformer** — https://github.com/alibaba-damo-academy/FunASR
- **silero-vad** — https://github.com/snakers4/silero-vad
