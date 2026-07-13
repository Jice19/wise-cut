# 拼接 + 字幕设计文档

> 范围:Phase 3 commit 6 的 `assembleTimeline` 节点 + `synthesize_voice` 节点中"拼接多视频 + 自动字幕"的设计。
>
> 起点状态:commit 4 阶段(workspace scaffold + media 包装 + M3 多模态 + analyzeAssets 串成 + IPC 脚手架)。本阶段未落地,本文档做设计存档,防遗忘。

---

## 1. 能力清单

### 拼接

| 能力                          | 实现                                          | 阶段     |
| ----------------------------- | --------------------------------------------- | -------- |
| 多视频顺序拼接                | ffmpeg `filter_complex` + `concat`            | commit 6 |
| 视频裁剪到分镜时长            | `-ss <startMs> -t <durMs>` 或 trim filter     | commit 6 |
| 视频变速(0.5x - 2x)           | `setpts` + `atempo` 串联                      | commit 6 |
| 视频画面缩放(到画布尺寸)      | `scale` + `crop` filter                       | commit 6 |
| 配音合成(每个 scene 一段 mp3) | VolcengineTTS 串行调用                        | commit 6 |
| BGM 混音 + 音量调节           | `amix` filter + `volume`                      | commit 6 |
| 输出 mp4                      | `ffmpeg ... -c:v libx264 -c:a aac output.mp4` | commit 6 |

### 自动字幕

| 能力                     | 实现                                                                   | 阶段     |
| ------------------------ | ---------------------------------------------------------------------- | -------- |
| 字幕文本生成             | `scene.narration` 拆句                                                 | commit 6 |
| 时间戳对齐               | `scene.startMs` / `scene.endMs` → SRT 格式                             | commit 6 |
| SRT 文件落盘             | `writeFile(subtitle.srt)`                                              | commit 6 |
| 字幕烧录到视频           | ffmpeg `-vf subtitles=subtitle.srt`                                    | commit 6 |
| 字幕字体跨平台           | macOS PingFang SC / Windows Microsoft YaHei / Linux Source Han Sans SC | commit 6 |
| 字幕样式(字号/位置/描边) | `force_style` 参数                                                     | commit 6 |

---

## 2. 端到端流程

```
用户素材目录(5 个 mp4)
   │
   ▼ scan_assets
[video1, video2, video3, video4, video5]   ← 仅 assetId + filePath
   │
   ▼ analyze_assets(commit 4 已实现)
每个 video → 元数据 + 帧描述
   │
   ▼ creative_brief(commit 6 待接)
LLM 解析 prompt → CreativeBrief{title, summary, audience, tone, keyMessages}
   │
   ▼ plan_scenes(commit 6 待接)
LLM 拆 6 个分镜 + 旁白
[
  {sceneId: 's1', startMs: 0,    endMs: 4000,  narration: '今天我们来到杭州西湖',    visualBrief: '...'},
  {sceneId: 's2', startMs: 4000, endMs: 9000,  narration: '湖面波光粼粼',                visualBrief: '...'},
  ...
]
   │  ← 旁白文字 = 字幕内容
   ▼ scene_approval(interrupt,等用户批)
用户批 →
   │
   ▼ match_assets
每个分镜选最合适的素材 → {sceneId → assetId}
   │
   ▼ synthesize_voice
每个分镜调 VolcengineTTS → 6 段 mp3
   │
   ▼ auto_bgm(可选)
选 BGM 段(song.json 候选)
   │
   ▼ assembleTimeline(commit 6 待接,本设计核心)
   ├─ 生成 SRT 字幕文件
   ├─ 拼接多视频(裁剪到分镜时长)
   ├─ 6 段配音按时间线对齐
   ├─ BGM 混音(音量 0.6)
   ├─ ffmpeg -filter_complex ... -c:v libx264
   └─ 输出 final.mp4
```

---

## 3. 拼接算法

### 3.1 filter_complex 结构

ffmpeg filter graph 把多轨时间线翻译成 `filter_complex` 字符串,而不是 `-i a -i b -filter '[0:a]...[1:a]...'`。这是 plan §0.2 的核心算法描述。

**单 scene 拼接示例**:

```bash
ffmpeg \
  -i video1.mp4 \
  -i voice1.mp3 \
  -i bgm.mp3 \
  -filter_complex "
    [0:v]trim=start=0:end=4,setpts=PTS-STARTPTS,scale=1920:1080[v0];
    [1:a]volume=1.0,adelay=0|0[a0];
    [2:a]volume=0.6,aloop=loop=-1:size=2e9[a1];
    [v0][a0][a1]concat=n=1:v=1:a=2[outv][outa]
  " \
  -map "[outv]" -map "[outa]" \
  -c:v libx264 -preset medium -crf 20 \
  -c:a aac \
  -y output.mp4
```

**多 scene 拼接**(plan §3.3 提到的 trim + concat):

```bash
ffmpeg \
  -i video1.mp4 \
  -i video2.mp4 \
  -i voice1.mp3 \
  -i voice2.mp3 \
  -i bgm.mp3 \
  -filter_complex "
    [0:v]trim=0:4,setpts=PTS-STARTPTS[v0];
    [1:v]trim=0:5,setpts=PTS-STARTPTS[v1];
    [0:a][1:a]concat=n=2:v=0:a=1[voices];
    [voices]volume=1.0[voicesv];
    [2:a]volume=0.6,aloop=loop=-1:size=2e9[bgmv];
    [v0][v1]concat=n=2:v=1:a=0[vids];
    [vids][voicesv][bgmv]concat=n=1:v=1:a=2[outv][outa]
  " \
  -map "[outv]" -map "[outa]" \
  -c:v libx264 -preset medium -crf 20 \
  -c:a aac \
  -y output.mp4
```

### 3.2 关键算法点

| 点               | 算法                                                                     |
| ---------------- | ------------------------------------------------------------------------ |
| **视频裁剪**     | `[0:v]trim=start=<ms/1000>:end=<ms/1000>,setpts=PTS-STARTPTS`            |
| **视频拼接**     | `[v0][v1]concat=n=2:v=1:a=0`                                             |
| **配音对齐**     | `[X:a]adelay=<ms>\|<ms>`(X 是 mp3 stream index)                          |
| **BGM 混音**     | `[X:a]volume=0.6,aloop=loop=-1:size=2e9`(loop 到视频时长)                |
| **音视频合流**   | `[vids][voices][bgm]concat=n=1:v=1:a=2`                                  |
| **变速**         | `setpts=PTS/<speed>` + `atempo=<speed>`(单次 atempo 限制 0.5~2.0,需串联) |
| **Windows 路径** | `filter_escape`(把 `:` 替换为 `\:`)                                      |

### 3.3 输入/输出

```ts
// 入参
type AssembleTimelineInput = {
    scenes: PlannedScene[]; // 含 matchedAssetId + startMs + endMs + narration
    assets: AssetAnalysis[]; // 含 filePath(被 matched 的视频)
    voices: VoiceSynthesisResult[]; // TTS 产物 mp3 路径 + durationMs
    bgm?: { filePath: string; volume?: number };
    canvas: { width: number; height: number; fps: number };
    outputPath: string;
};

// 出参
type AssembleTimelineResult = {
    outputPath: string; // 最终 mp4 路径
    durationMs: number; // 实际合成时长
    command: string; // 调试用,完整 ffmpeg 命令
};
```

---

## 4. 自动字幕算法

### 4.1 SRT 格式

```
1
00:00:00,000 --> 00:00:03,500
今天我们来到杭州西湖

2
00:00:03,500 --> 00:00:07,200
湖面波光粼粼,远处的雷峰塔若隐若现
```

### 4.2 字幕生成算法

```ts
function narrationToSrt(scenes: PlannedScene[]): string {
    return scenes
        .map((scene, idx) => {
            const start = formatTimestamp(scene.startMs);
            const end = formatTimestamp(scene.endMs);
            return `${idx + 1}\n${start} --> ${end}\n${scene.narration}\n`;
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

### 4.3 长句拆段(可选优化)

如果 `narration.length > 25 字`(plan §15.2 D2 TTS 可朗读性阈值),按标点拆成多行字幕:

```
1
00:00:00,000 --> 00:00:02,000
今天我们来到杭州西湖

2
00:00:02,000 --> 00:00:04,000
湖面波光粼粼
```

用 `scene.subtitleLines`(plan §5 SceneSchema 字段)而不是直接拆 `narration`。`subtitleLines` 是 LLM 在 plan_scenes 阶段已经拆好的(plan §3 提到"字幕分段是 TTS 可朗读的")。

### 4.4 字幕烧录

```bash
ffmpeg -i input.mp4 \
  -vf "subtitles=subtitle.srt:force_style='Fontsize=24,PrimaryColour=&Hffffff&'" \
  -c:a copy \
  -y output_with_subs.mp4
```

**字体跨平台**(plan §0.2):

| 平台    | 字体               |
| ------- | ------------------ |
| macOS   | PingFang SC        |
| Windows | Microsoft YaHei    |
| Linux   | Source Han Sans SC |

通过 `fontsdir` + `fontname` 参数指定,自动探测平台。

### 4.5 字幕样式参数

```ts
type SubtitleStyle = {
    fontName?: string; // 默认按平台选
    fontSize?: number; // 默认 24
    primaryColor?: string; // 默认白色 &Hffffff
    outlineColor?: string; // 默认黑色 &H000000
    outlineWidth?: number; // 默认 2
    alignment?: number; // 默认 2(底部居中)
};
```

---

## 5. 进度回调

### 5.1 ffmpeg 实时进度

ffmpeg `-progress pipe:1` 把每帧进度打到 stdout:

```
frame=120
fps=29.97
out_time_ms=4000000
progress=continue
```

主进程解析后 emit `EXPORT_PROGRESS` 事件:

```ts
// 主进程
ffmpeg.stdout.on('data', (chunk) => {
    const outTimeMs = parseOutTimeMs(chunk.toString());
    const percent = (outTimeMs / expectedDurationMs) * 100;
    webContents.send(IPC.EXPORT_PROGRESS, { percent, phase: 'rendering' });
});
```

### 5.2 阶段划分(plan §4.6)

| 阶段        | 触发                                        |
| ----------- | ------------------------------------------- |
| `preparing` | ffmpeg 命令拼装 + 临时目录准备              |
| `rendering` | ffmpeg 进程启动后,按 `-progress` 推 percent |
| `completed` | ffmpeg 进程退出码 0                         |
| `cancelled` | 用户中途点取消 → kill ffmpeg 进程           |
| `failed`    | ffmpeg 退出码非 0                           |

### 5.3 取消语义

```ts
const controller = new AbortController();
const ffmpegProcess = spawn('ffmpeg', args, { signal: controller.signal });

// 用户点取消 → controller.abort()
// → ffmpeg 进程被 kill
// → emit EXPORT_PROGRESS with phase: 'cancelled'
// → 清理临时目录(SRT + 中间 mp4)
```

---

## 6. 模块划分

### 6.1 新增(`packages/video-agent/src/`)

- `audio/probe-audio-duration.ts` —— ffprobe 探测 TTS 产物 mp3 时长
- `audio/build-srt.ts` —— `narrationToSrt(scenes)` + `formatTimestamp(ms)`
- `audio/build-subtitle-style.ts` —— 跨平台字体探测

### 6.2 新增(`apps/desktop/client/`)

- `export/build-export-command.ts` —— `assembleTimeline(input) → string`(ffmpeg 命令)
- `export/run-export.ts` —— spawn ffmpeg + 进度解析 + 取消支持
- `export/resolve-binaries.ts` —— `process.resourcesPath/bin/<platform>/ffmpeg`

### 6.3 修改

- `packages/video-agent/src/graph/nodes.ts` —— `assembleTimeline` 节点调 build-export-command + run-export
- `packages/video-project/src/schema.ts` —— `SceneSchema` 加 `subtitleLines` 字段(commit 7 落地)
- `apps/desktop/shared/ipc.ts` —— `EXPORT_START / EXPORT_PROGRESS / EXPORT_CANCEL` 已声明(commit 4)

---

## 7. 测试矩阵

| 测试                           | 覆盖                                         |
| ------------------------------ | -------------------------------------------- |
| `narration-to-srt.test.ts`     | 6 个分镜 → SRT 字符串,时间戳精确到 ms        |
| `build-export-command.test.ts` | 单 scene / 多 scene 命令格式校验             |
| `run-export.test.ts:success`   | 真实拼接 2 个 5s mp4 → 输出 mp4,ffprobe 验证 |
| `run-export.test.ts:progress`  | 进度回调,percent 0-100 递增                  |
| `run-export.test.ts:cancel`    | 中途取消,ffmpeg 进程被 kill,临时文件清理     |
| `subtitle-burn.test.ts`        | SRT 烧录到视频,ffprobe 验证 streams          |
| `cross-platform-font.test.ts`  | macOS / Windows / Linux 字体探测             |

---

## 8. 风险

1. **ffmpeg 二进制打包** — 开发期用系统 PATH,打包后用 `process.resourcesPath/bin/<platform>/ffmpeg`。本仓 `apps/desktop/bin/darwin/` / `win32/` 当前是 `.gitkeep` 占位,需要后续打包阶段补真二进制。
2. **atempo 串联** — 单次 atempo 限制 0.5~2.0,如果分镜要 3x 变速需要串联 2 次。
3. **Windows 路径** — ffmpeg filter 语法对 `:` 敏感,Windows 路径要 `filter_escape`。
4. **字幕字体** — 跨平台字体兼容性,Linux 服务器可能没装中文字体,需要 fallback。
5. **进度精度** — ffmpeg `-progress` 输出是按帧,不是按时间,短场景精度差。

---

## 9. 引用清单

- **ffmpeg filter_complex 语法** — https://ffmpeg.org/ffmpeg-filters.html
- **ffmpeg concat filter** — https://ffmpeg.org/ffmpeg-filters.html#concat
- **ffmpeg amix filter** — https://ffmpeg.org/ffmpeg-filters.html#amix
- **ffmpeg subtitles filter** — https://ffmpeg.org/ffmpeg-filters.html#subtitles-1
- **SRT 字幕格式** — https://www.matroska.org/technical/subtitles.html#srt-subtitles
- **plan §0.2 音视频层原则** — `docs/plan-2.0-langgraph.md`
- **plan §5 VideoProject schema 字段** — `docs/plan-2.0-langgraph.md`
- **plan §6 流水线 10 节点** — `docs/plan-2.0-langgraph.md`
