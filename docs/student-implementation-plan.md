# 智能剪辑平台 — 下一阶段需求文档

> 范围:**Phase 2 收尾 → Phase 3 三个 Agent → Phase 4 多档分辨率**。
> 起点状态:Phase 1(`apps/desktop/scripts/api-probe/` + `tts-protocol/` + 两个 provider)已落地,提交 `8f1ed22`;Agent Run / Editor 页面只是 UI 壳,`packages/` 是空目录。
> 文档原则:描述**算法流程**和**字段约定**,引用参考项目时仅给路径 + 自然语言描述,不粘贴源码、不引用版权/作者信息。

---

## 0. 上下文(Context)

视频剪辑平台目前有三块已经搭好:

1. **桌面壳**(Electron 38 + React 18):路由 `/workspace`、`/create`、`/create/runs/:runId`、`/editor`、`/export`,页面只是 UI 占位。
2. **IPC 桥**:仅 `app:get-version / app:get-platform / window:* / menu:command`,**没有任何 video-agent IPC**。
3. **API 封装层**:`apps/desktop/scripts/api-probe/providers/` 下两个 provider —— `VolcengineTtsProvider`(已跑通 `event===SessionFinished` 结束信号,25965 字节 mp3 入盘)和 `MinimaxM3ChatProvider`(已跑通多模态,识别宝马 SUV 图像)。

当前**缺**:
- 视频代理(抽帧 → 多模态描述 → 场景规划 → 配音 → 时间线组装)的主体代码
- ffmpeg / ffprobe 在主进程里的调用入口
- ffmpeg 二进制与 `extraResource` 的路径解析
- 视频项目数据结构 + Zod schema
- 三个核心 Agent(quality_scoring / auto_bgm / beat_cut)
- 多档分辨率导出

目标:把"上传视频 → AI 理解画面 → 自动配字幕 / 配音 / 切点 → 一键导出 mp4"链路端到端打通,中间不需要人工介入。

### 0.1 分层架构基调

整个平台分四层,职责单一,跨层通信走 schema 契约:

| 层 | 物理位置 | 职责 |
|---|---|---|
| **界面层**(renderer) | `apps/desktop/renderer/` | React UI、IPC 客户端、用户交互 |
| **智能体层**(video-agent) | `packages/video-agent/src/` | 流水线编排、LLM prompt、Agent 算法、Provider 接口定义 |
| **音视频层**(media + export) | `apps/desktop/client/{media,export}/` + `packages/video-agent/src/media/` | ffmpeg / ffprobe 调用、命令构建、进度解析、二进制解析 |
| **桌面底层**(electron main) | `apps/desktop/client/` | 进程生命周期、IPC 注册、文件系统、子进程 |

**全链路 Zod**:数据从输入(LLM prompt 模板参数)→ 输出(LLM response)→ 中间态(`Scene / AssetAnalysis / VideoProject`)→ 落盘 JSON 全部走 Zod 校验,任何不合法的字段都抛 `ZodSchemaError`,不静默丢弃。`packages/video-project/src/schema.ts` 是**事实上的契约源头**,跨层 import 同一份 schema。

### 0.2 音视频层原则(参考已验证实践)

`apps/desktop/client/export/build-export-command.ts` 是音视频层核心,实现要点:

- 把多轨时间线翻译成 ffmpeg `filter_complex` 字符串,而不是 `-i a -i b -filter '[0:a]...[1:a]...'`
- `atempo` 串联做变速(单次 atempo 限制 0.5~2.0)
- Windows 路径用 `filter_escape`(把 `:` 替换为 `\:`)
- 字幕字体跨平台兼容(macOS → PingFang SC / Windows → Microsoft YaHei / Linux → Source Han Sans SC)
- ffmpeg stderr 解析 `out_time_(us|ms)` 或 `time=` 回退,推 `EXPORT_PROGRESS` IPC
- 取消用 `AbortController`,kill 子进程后清理临时 SRT 目录

### 0.3 混合开发流程

本阶段工程基调:**探索阶段用 Vibe Coding 快速验证方向(已完成 Phase 1),稳定阶段切到 Spec Driven 开发(本阶段)**。Plan 文档就是 Spec,所有改动以 commit 为粒度回填到 §10 实施顺序,每个 commit 都跑 `pnpm lint` + `pnpm test:run`,保证 `main` 分支随时可启动。

### 0.4 明确不在本阶段范围

- LangGraph / Checkpoint / 断点续跑 —— Phase 5 评估
- macOS Developer ID 签名 + 公证 / Windows 代码签名
- Electron 自定义协议 + Range 请求(file:// 安全性)
- 线上格式错误率统计、重复场景响应速度等 KPI 指标

---

## 1. 模块划分(本阶段会新增 / 修改)

```
miaoma-magicut/(本仓)
├── apps/desktop/
│   ├── client/                         ← Electron 主进程
│   │   ├── main.ts                     ← 新增 ffmpeg/ffprobe 二进制解析 + video-agent IPC 注册
│   │   ├── video-agent-tools.ts        ← 新增,VideoAgentTools 接口的桌面实现(串起 packages/video-agent)
│   │   ├── video-agent-ipc.ts          ← 新增,IPC 控制器(start/approve/cancel/regenerate*)
│   │   ├── media/
│   │   │   ├── extract-keyframes.ts    ← 新增,ffmpeg 抽帧
│   │   │   ├── probe-media.ts          ← 新增,ffprobe 元数据
│   │   │   └── probe-audio-duration.ts ← 新增,ffprobe 探音频时长(用于 TTS 产物)
│   │   ├── export/
│   │   │   ├── build-export-command.ts ← 新增,拼 ffmpeg filter graph
│   │   │   ├── run-export.ts           ← 新增,spawn ffmpeg + 进度解析
│   │   │   └── resolve-binaries.ts     ← 新增,从 process.resourcesPath 解 ffmpeg/ffprobe
│   ├── shared/ipc.ts                   ← 扩展,新增 video-agent + export 通道
│   └── renderer/                       ← UI 改动暂不在本阶段,仅在 Editor 卡片显示 description
│
├── packages/                           ← 本阶段首次真正使用
│   ├── video-agent/                    ← 新增
│   │   ├── src/
│   │   │   ├── graph/                  ← Agent 状态机(纯顺序 await,不引 LangGraph)
│   │   │   │   ├── pipeline.ts         ← 7 步流水线主入口
│   │   │   │   └── steps/              ← scan-assets / analyze-assets / creative-brief / plan-scenes / match-assets / synthesize-voice / assemble-timeline
│   │   │   ├── tools/
│   │   │   │   └── video-agent-tools.ts ← 工具接口(由 desktop 端实现)
│   │   │   ├── prompts/                ← 各类 LLM prompt 模板(中文为主)
│   │   │   │   ├── creative-brief.ts
│   │   │   │   ├── scene-planner.ts
│   │   │   │   ├── frame-description.ts
│   │   │   │   ├── asset-matcher.ts
│   │   │   │   ├── quality-scoring.ts
│   │   │   │   ├── auto-bgm.ts
│   │   │   │   └── beat-cut.ts
│   │   │   ├── providers/
│   │   │   │   ├── model-provider.ts   ← Provider 接口(参考参考项目的 model-provider.ts:31)
│   │   │   │   ├── m3-chat-model-provider.ts ← 包装已有 MinimaxM3ChatProvider
│   │   │   │   ├── tts-provider.ts     ← Provider 接口
│   │   │   │   └── volcengine-tts-provider.ts ← 包装已有 VolcengineTtsProvider
│   │   │   ├── agents/                 ← 本阶段新做的 3 个 Agent
│   │   │   │   ├── quality-scoring.ts
│   │   │   │   ├── auto-bgm.ts
│   │   │   │   └── beat-cut.ts
│   │   │   └── index.ts
│   │   └── package.json                ← name: @miaoma-magicut/video-agent
│   │
│   └── video-project/                  ← 新增
│       ├── src/
│       │   ├── schema.ts               ← Zod:VideoProject / AssetAnalysis / Scene / Timeline / Canvas / RenderConfig
│       │   └── types.ts                ← 从 Zod 推导的 TS 类型
│       └── package.json                ← name: @miaoma-magicut/video-project
│
└── docs/student-implementation-plan.md ← 更新进度标记
```

**关键设计取舍**(已与用户确认):

| 决策 | 选择 | 理由 |
|---|---|---|
| 范围 | 只详细描述 Phase 2/3/4 | 用户拍板;其他阶段单列规划点 |
| 架构 | 新增 `packages/video-agent` + `packages/video-project` | 与参考项目一致,workspace 引用清晰 |
| 多模态输入 | 优先 base64 data URL | Minimax-M3 / 通用 OpenAI 兼容 API 看 base64 才有效 |
| Agent 状态机 | **不用 LangGraph**,纯顺序 await | 减少依赖、状态可读、调试简单;`packages/video-agent/src/graph/pipeline.ts` 一个文件就够。断点续跑 / Checkpoint 推到 Phase 5 评估。 |
| LLM 框架 | **不用 @langchain/openai**,直接调 `MinimaxM3ChatProvider` | 已有封装,无 Zod 自动结构化需求(我们自己在 prompt 里要求严格 JSON,再 `.parse` 一次) |
| BGM 素材 | **动态生成**(`ffmpeg` 合 6 段 demo + 写 `song.json`) | 不引外部版权素材,生成过程可复现,便于 CI 测试 |
| ffmpeg | 走 `extraResource` 路径,Windows/macOS/Linux 都内置 | 复用参考项目的 `resolveVideoExportBinaries` 设计 |

---

## 2. Phase 2 收尾 — analyzeAssets + 真实抽帧

### 2.1 目标

把"视频素材 → 自动画面描述"这条链路**真正**接通,而不是只回一个文件名。

### 2.2 子任务 A:`extractKeyframes`(真实抽帧 + 真实 timestamp)

**文件**:`packages/video-agent/src/media/extract-keyframes.ts`(主进程侧 `apps/desktop/client/media/extract-keyframes.ts` 调它)。

**算法**(自然语言描述):

1. 入参:`{ ffmpegPath, filePath, sampleIntervalSec, outputDirectory, maxFrames = 8 }`。`sampleIntervalSec` 默认 2(每 2 秒抽 1 帧)。
2. 用 `ffmpeg -hide_banner -loglevel error -i <file> -vf "fps=1/<N>" -frames:v <maxFrames> -q:v 2 -y <outputDir>/frame-%03d.jpg` 抽帧。
3. **再单独跑一次** `ffprobe -v error -select_streams v:0 -show_entries packet=pts_time,flags -of csv <file>`,用 `flags=K_` 过滤出真正的关键帧 pts,或者用 `ffprobe -read_intervals` 配合 `-show_frames -select_streams v -show_entries frame=pts_time,key_frame` 拿每帧时间戳。
4. 抽帧后用 `readdir` 拿回文件列表,**用 ffprobe 的帧时间戳数组**填回 `timestampMs`,不再写死 0。
5. 输出:`ExtractedKeyframe[] = { index, path, timestampMs, width, height }`。

**关键修正**(对比参考项目):参考项目 `extractKeyframes` 直接 `ffmpeg -frames:v N` 取前 N 帧,`timestampMs` 写死 0;我们的版本用 `-vf fps=1/N` 均匀采样 + ffprobe 单独拿 pts,保证时间戳可用。

### 2.3 子任务 B:`probeMedia`(ffprobe 元数据)

**文件**:`packages/video-agent/src/media/probe-media.ts`。

**算法**:

1. `ffprobe -v error -print_format json -show_format -show_streams <file>`。
2. 解析得到 `{ codecName, durationMs, width, height, fps, hasAudio }`。
3. `fps` 从 `r_frame_rate` 字段解析为分数(如 `30000/1001` → 29.97)。
4. `durationMs` 从 `format.duration` 乘 1000 取整。

**返回值**:`MediaMetadata = { codecName, durationMs, filePath, fps, height, width, hasAudio }`。

### 2.4 子任务 C:`describeFrames`(多模态 LLM 调用)

**文件**:`packages/video-agent/src/providers/m3-chat-model-provider.ts`(本仓实现,不复用参考项目 `@langchain/openai`)。

**算法**:

1. 入参:`{ frames: Array<{ frameId, base64DataUrl, mimeType }> }`。
2. 构造 messages:`{ role: 'user', content: [{ type: 'text', text: <prompt> }, ...frames.map(f => ({ type: 'image_url', image_url: { url: f.base64DataUrl } }))] }`。
3. prompt 模板(`prompts/frame-description.ts`):
   - 一行系统提示(中文):"你是视频关键帧理解智能体,请逐帧输出 JSON,严格 JSON,不要 Markdown"。
   - 一行 schema 示例:`{ frames: [{ frameId, description(≤80字), objects, actions, mood }] }`。
4. `MinimaxM3ChatProvider.chat({ messages, maxTokens: 1024, temperature: 0.4 })`。
5. 解析 `JSON.parse(text)` → `.frames`,逐项 zod 校验(`frame-description.ts` 的 `FrameDescriptionSchema`)。
6. 任一帧 schema 失败 → 抛 `FrameDescriptionSchemaError`(携带 `issues` 和 `frameId`)。

**关键修正**(对比参考项目):参考项目只发 `imagePath`(OpenAI 兼容客户端看不到文件),本仓发 base64 data URL,确保多模态真实可见。

### 2.5 子任务 D:串成 `analyzeAssets` 步骤

**文件**:`packages/video-agent/src/graph/steps/analyze-assets.ts`。

**算法**:

1. 接收上游 `scanAssets` 产出的 `AssetAnalysis[]`(含 `{ assetId, filePath }`)。
2. 对每个 asset:
   - `probeMedia({ ffprobePath, filePath })` → 真实 `durationMs / width / height / fps`,覆盖 `scanAssets` 的硬编码 5000+1500*N。
   - `extractKeyframes({ ffmpegPath, filePath, sampleIntervalSec: 2, outputDirectory: <tmpDir>, maxFrames: 6 })` → `ExtractedKeyframe[]`。
   - 把每个 `ExtractedKeyframe.path` 读成 base64 data URL,构造 `FrameDescriptionInput[]`。
   - `modelProvider.describeFrames({ frames })` → `FrameDescription[]`。
   - 用 `frame.timestampMs` 对齐 LLM 描述,产出 `{ assetId, frameId, timestampMs, description, objects, actions, mood }[]` 写回 `AssetAnalysis.frames`。
3. `AssetAnalysis` 终态:`{ assetId, filePath, description(从 frames[0].description 摘要), durationMs, fps, width, height, frames[] }`。
4. 失败策略:任意一个 asset 失败 → 该 asset 标记 `frames: []` 但**不抛错**,允许 pipeline 继续走(便于后续 Phase 3 quality_scoring 把"无描述"的素材降权)。

### 2.6 IPC 通道扩展(`shared/ipc.ts`)

新增以下 channel:

```ts
export const IPC = {
    // ... 已有
    VIDEO_AGENT_START: 'video-agent:start',
    VIDEO_AGENT_APPROVE: 'video-agent:approve',
    VIDEO_AGENT_CANCEL: 'video-agent:cancel',
    VIDEO_AGENT_REGENERATE_SCENE: 'video-agent:regenerate-scene',
    VIDEO_AGENT_REGENERATE_VOICES: 'video-agent:regenerate-voices',
    VIDEO_AGENT_STATUS: 'video-agent:status',          // 主 → 渲染,push 状态
    VIDEO_AGENT_LOG: 'video-agent:log',                // 主 → 渲染,push 日志
    EXPORT_START: 'export:start',
    EXPORT_PROGRESS: 'export:progress',                // 主 → 渲染,push 进度
    EXPORT_CANCEL: 'export:cancel'
} as const;
```

`MiaomaAPI` 接口相应扩展。

---

## 3. Phase 3 — 三个核心 Agent

> 所有 Agent 都是 `packages/video-agent/src/agents/` 下的纯函数,输入由 pipeline 喂,输出喂回 pipeline。

### 3.1 Agent 1:`quality_scoring`(分镜评分)

**目标**:对 planScenes 输出的每个 Scene 打质量分,低于阈值的 scene 触发 `plan_scenes` 重跑。

**算法**:

1. 入参:`{ scenes: PlannedScene[], assets: AssetAnalysis[], threshold = 0.65 }`。
2. 用 `ModelProvider`(实际就是 Minimax M3)调用 prompt `prompts/quality-scoring.ts`,输入是 `scenes + assets`(文字描述,不带图),要求输出 `{ scores: [{ sceneId, score (0..1), reason }] }`。
3. 校验 schema,任何 score 缺失补 0。
4. 输出:`{ scores, lowQualitySceneIds: string[] }`。
5. **流水线集成**:`plan_scenes` 之后插入 `quality_scoring`,若 `lowQualitySceneIds.length > 0`,重跑 `plan_scenes` 并附上低分原因,最多重试 2 次。
6. **降级**:M3 不可用时,用启发式打分:`description.length < 20 → 0.4`,否则 `0.8`。

### 3.2 Agent 2:`auto_bgm`(BGM 推荐)

**目标**:从候选 BGM 列表里挑最合适的一首,作为背景音乐写入项目。

**BGM 素材来源(本阶段动态生成,不引外部版权素材)**:

- 在仓库初始化时跑一次 `pnpm generate-demo-bgm`(脚本位于 `apps/desktop/scripts/generate-demo-bgm.ts`),用 `ffmpeg` 合成 6 段 30~90 秒的占位 mp3,分别对应 6 种 mood:`peaceful / uplifting / tense / romantic / epic / neutral`。
- 同步生成 `apps/desktop/renderer/assets/song/song.json`,字段:`{ id, title, mood, bpm, durationSec, filePath }`,6 条记录。
- 脚本只在 `assets/song/` 目录空时跑;已有内容跳过,避免重复生成覆盖用户改动。
- 这 6 段 demo mp3 走 forge `extraResource`,打包后随安装包分发。

**算法**:

1. 入参:`{ creativeBrief: CreativeBrief, candidateBgm: BgmTrack[] }`(`candidateBgm` 从 `song.json` 读出)。
2. `BgmTrack = { id, title, mood, bpm, durationSec, filePath }`。
3. 用 `ModelProvider` 调用 `prompts/auto-bgm.ts`,要求输出 `{ chosenId, reason }`。
4. 校验 schema,`chosenId` 必须在 `candidateBgm` 里,否则降级:按 mood 关键词匹配(creativeBrief.mood 包含 "温馨" → 选 `peaceful`;包含 "紧张" → 选 `tense`;其他 → 选 `neutral`)。
5. 输出:`{ chosenBgm: BgmTrack, reason }`。
6. **流水线集成**:`match_assets` 之后插入 `auto_bgm`,把结果写到 `Project.assets.music = { provider: 'bundled', trackId, filePath, volume: 0.6 }`。

### 3.3 Agent 3:`beat_cut`(节拍切点)

**目标**:对配音 mp3 跑 `ffprobe silencedetect` 找静音段,在静音处切视频,产出更紧凑的时间线。

**算法**:

1. 入参:`{ voiceFilePath: string, scenes: PlannedScene[] }`。
2. 跑 `ffmpeg -i voiceFilePath -af silencedetect=noise=-30dB:d=0.3 -f null - 2>&1`,从 stderr 解析 `silence_start` / `silence_end` 区间列表。
3. 把静音区间作为 "natural cut points" 加到 scenes:每个 scene 的 `endMs` 取 min(scene.originalEndMs, 下一个静音起点)。
4. 输出:`{ adjustedScenes: PlannedScene[] }`。
5. **流水线集成**:`synthesize_voice` 之后、`assemble_timeline` 之前插入。
6. **降级**:无静音段 → 直接返回原 scenes。

---

## 4. Phase 4 — 多档分辨率导出

### 4.1 目标

让 `RenderConfig.quality` 真正生效,从 `preview | final` 扩成 4 档:`720p / 1080p / 2k / 4k`。

### 4.2 改动 1:Schema 扩展(`packages/video-project/src/schema.ts`)

把 `RenderConfigSchema.quality` 由 `'preview' | 'final'` 扩成:

```ts
quality: z.enum(['720p', '1080p', '2k', '4k'])
```

### 4.3 改动 2:解析映射(`apps/desktop/client/export/build-export-command.ts`)

新增分辨率表:

| quality | width × height | crf | preset |
|---|---|---|---|
| 720p   | 1280 × 720  | 23 | medium |
| 1080p  | 1920 × 1080 | 20 | medium |
| 2k     | 2560 × 1440 | 18 | slow   |
| 4k     | 3840 × 2160 | 16 | slow   |

### 4.4 改动 3:filter graph 末尾插入 scale

参考项目固定 `scale=<canvas.w>:<canvas.h>:force_original_aspect_ratio=increase,crop=...`。本阶段改为按 `RenderConfig.quality` 选择目标 `canvas.w / canvas.h`,**不动 filter graph 主体结构**,仅替换 `width / height / crf` 三个值。

### 4.5 改动 4:UI(`apps/desktop/renderer/components/video-editor/transport-bar.tsx`)

在导出按钮旁加 `<SegmentedControl>` 控件,4 个选项 `720p / 1080p / 2k / 4k`,默认 `1080p`。选中后写到 `RenderConfig.quality`。

### 4.6 改动 5:进度回调

参考项目把进度 clamp 在 `[10, 99]`(最终 100% 在 ffmpeg close 后发)。本阶段保留这个行为,但同时新增 `phase: 'preparing' | 'rendering' | 'completed' | 'cancelled' | 'failed'`,renderer 端可以显示文字进度。

---

## 5. 数据契约(`packages/video-project/src/schema.ts`)

> 本节列出本阶段新增 / 扩展的核心 Zod schema。**只描述字段含义与类型**,不照抄参考项目代码。

```ts
// 已扩展(参考项目是 2 档,本阶段改 4 档)
RenderConfigSchema = { format: 'mp4', quality: '720p' | '1080p' | '2k' | '4k' }

// 新增
AssetAnalysisSchema = {
    assetId: string,
    filePath: string,
    description: string,                     // 由 frames[0].description 摘要
    durationMs: number,                     // 由 probeMedia 真实测量
    fps: number,
    width: number,
    height: number,
    frames: Array<{
        frameId: string,
        timestampMs: number,                // 真实时间戳(不再写 0)
        description: string,
        objects: string[],
        actions: string[],
        mood: string
    }>
}

SceneSchema = {
    sceneId: string,
    startMs: number,
    endMs: number,
    narration: string,
    visualBrief: string,
    matchedAssetId: string | null,
    qualityScore: number | null              // 由 quality_scoring 写入
}

VoiceSegmentSchema = {
    segmentId: string,
    text: string,
    voiceProvider: 'volcengine-seed-tts',
    voiceSpeaker: string,
    filePath: string,
    durationMs: number,
    startMs: number
}

MusicSchema = {
    provider: 'bundled',
    trackId: string,
    filePath: string,
    volume: number                           // 0..1
}

VideoProjectSchema = {
    id: string,
    title: string,
    canvas: { width, height, fps, durationMs, safeArea },
    assets: {
        videos: AssetAnalysis[],
        voices: VoiceSegment[],
        music: MusicSchema | null,
        subtitles: SubtitleSegment[]
    },
    scenes: SceneSchema[],
    renderConfig: RenderConfigSchema
}
```

---

## 6. 流水线总览(`packages/video-agent/src/graph/pipeline.ts`)

```
input(sourceAssetDir + brief + canvas + renderConfig)
    │
    ▼
1. scan_assets     ──→ readdir + ext filter → AssetAnalysis[] (无 description)
    │
    ▼
2. analyze_assets  ──→ probeMedia + extractKeyframes + describeFrames(M3 base64)
    │                   → AssetAnalysis[] 真实描述
    │
    ▼
3. creative_brief  ──→ M3.generateCreativeBrief → CreativeBrief
    │
    ▼
4. plan_scenes     ──→ M3.planScenes → PlannedScene[] (含 narration + visualBrief)
    │
    ▼
5. quality_scoring ──→ M3 评分,低分重跑 plan_scenes(最多 2 次)
    │
    ▼
6. match_assets    ──→ M3.rankAssetMatches → 选素材 + 填 matchedAssetId
    │
    ▼
7. synthesize_voice──→ VolcengineTtsProvider.synthesizeSpeech(每个 scene 一段)
    │
    ▼
8. auto_bgm        ──→ M3 从 song.json 选 BGM
    │
    ▼
9. beat_cut        ──→ ffprobe silencedetect → 调整 scene endMs
    │
    ▼
10. assemble_timeline──→ 拼成 VideoProject(纯函数,无 IO)
    │
    ▼
output(VideoProject)
```

**取消语义**:每一步前检查 `controller.cancelled`,若是则抛 `PipelineCancelledError`,主进程转成 `VIDEO_AGENT_STATUS` 事件推给 renderer。

---

## 7. 关键文件清单

**新增**:

- `packages/video-agent/package.json`、`tsconfig.json`、`vitest.config.ts`
- `packages/video-agent/src/index.ts`
- `packages/video-agent/src/graph/pipeline.ts`
- `packages/video-agent/src/graph/steps/{scan-assets,analyze-assets,creative-brief,plan-scenes,match-assets,synthesize-voice,assemble-timeline}.ts`
- `packages/video-agent/src/tools/video-agent-tools.ts`
- `packages/video-agent/src/prompts/{creative-brief,scene-planner,frame-description,asset-matcher,quality-scoring,auto-bgm,beat-cut}.ts`
- `packages/video-agent/src/providers/{model-provider,tts-provider,m3-chat-model-provider,volcengine-tts-provider}.ts`
- `packages/video-agent/src/agents/{quality-scoring,auto-bgm,beat-cut}.ts`
- `packages/video-agent/src/media/{extract-keyframes,probe-media,probe-audio-duration}.ts`
- `packages/video-project/package.json`、`tsconfig.json`
- `packages/video-project/src/{schema,types,index}.ts`
- `apps/desktop/client/media/{extract-keyframes,probe-media}.ts`(薄包装,调 packages)
- `apps/desktop/client/video-agent-{tools,ipc}.ts`
- `apps/desktop/client/export/{resolve-binaries,build-export-command,run-export}.ts`
- `apps/desktop/scripts/generate-demo-bgm.ts` —— 新增,用 `ffmpeg` 动态合成 6 段 BGM + 写 `song.json`
- `apps/desktop/renderer/assets/song/song.json` —— 由上述脚本生成(动态产物,不手写)
- `apps/desktop/renderer/assets/song/*.mp3` —— 同上(走 forge `extraResource`)
- `apps/desktop/renderer/components/video-editor/quality-segmented-control.tsx`(新组件)

**修改**:

- `apps/desktop/shared/ipc.ts` — 新增 8 个 channel + `MiaomaAPI` 扩展
- `apps/desktop/client/main.ts` — 注册新 IPC、解析 ffmpeg/ffprobe 路径、传 `ffprobePath` 给 controller
- `apps/desktop/renderer/components/video-editor/transport-bar.tsx` — 加分辨率选择控件
- `apps/desktop/renderer/pages/editor-screen.tsx` — 视频卡片显示 `description`(取 `frames[0].description`)
- `pnpm-workspace.yaml`(已存在,无需改)+ 根 `package.json` 增加 workspace 引用
- `eslint.config.mjs`(无需改,monorepo 递归生效)
- `forge.config.ts` — 确认 `extraResource` 已含 `renderer/assets/song`(可能新增 `bin` 资源)

---

## 8. 验收

### 8.1 自动化测试(`vitest`,新增 ~15 个)

`packages/video-agent/tests/`:

- `media-scan.test.ts`:用 `apps/desktop/bin/darwin/ffmpeg` 跑一个 10s 测试 mp4,断言 `extractKeyframes` 返回的 `timestampMs` 全部 > 0 且按升序、间隔 ≈ `sampleIntervalSec * 1000`
- `probe-media.test.ts`:断言返回的 `fps / width / height` 与 ffprobe 命令行输出一致
- `describe-frames.test.ts`:用 `apps/desktop/scripts/api-probe/.probe-out/` 现有 mp3 文件抽 1 帧,喂 M3,断言返回 schema 合法(集成测试,需 `API_KEY`)
- `quality-scoring.test.ts`:mock M3,断言低分 scene 被识别
- `auto-bgm.test.ts`:mock M3 + 3 首 BGM,断言返回的 `chosenBgm.id` 在候选里
- `beat-cut.test.ts`:用一个 5s 含 1s 静音的 wav,断言 scenes.endMs 被正确截断
- `pipeline.test.ts`:mock 所有 provider,跑完整流水线,断言产出 `VideoProject` 满足 schema

`apps/desktop/tests/`(已有基础设施):新增 `video-agent-tools.test.ts`,断言 desktop 端 `analyzeAssets` 真的调到了 `extractKeyframes`。

### 8.2 端到端冒烟

1. `pnpm install` 0 error
2. `pnpm -r test:run` 全绿
3. `pnpm start` 启动 Electron,DevTools 自动打开
4. 把 `apps/desktop/renderer/assets/song/song.json` 配好 + 把 `assets/视频.mp4` 拷贝到 workspace 的 `input/` 目录
5. 在 `/create` 页点击"开始剪辑",DevTools Network 看到 `video-agent:start` IPC,主进程终端看到 7 个 step 的日志
6. 完成后 `/editor` 页每个视频卡片显示 `description`(取自 M3 多模态输出)
7. `/export` 页选 `4k`,DevTools 看到 `export:progress` 推流,`ffmpeg` 命令最终行包含 `3840x2160`
8. 输出的 mp4 能用 `ffprobe` 读到 `3840x2160`
9. 取消按钮(中途点停止)→ 5s 内 ffmpeg 进程被 kill,IPC 推 `cancelled`

### 8.3 不破坏既有

- `pnpm probe:tts` 仍能写出 25965 字节 mp3
- `pnpm probe:m3` 仍能识别 `宝马x5.png` 并输出中文描述
- `pnpm lint` 0 error(沿用 ESLint flat config,5 段 import 排序)
- `pnpm exec prettier --check "**/*.{ts,tsx,json,css,md}"` All matched clean

---

## 9. 风险与开放问题

1. **M3 配额**:多模态调一次 ~30K token(6 帧 base64),每个 asset 一次,跑完一个 10 素材的 pipeline 约 300K token。若用户配额紧张,`sampleIntervalSec` 可调成 5(只抽 2 帧)。
2. **ffmpeg 在 Windows**:打包时 `apps/desktop/bin/win32/` 必须有真 ffmpeg.exe + ffprobe.exe,本阶段不补二进制,只补路径解析(`.exe` 后缀按 platform 加)。补二进制是另一个任务。
3. **LLM prompt 中文输出**:prompt 模板里的 schema 示例要中文,避免模型混英文回答。
4. **base64 大小**:`image_url` 用 base64 时,每个 token 约 4 字符,1 张 1024×1024 jpg ~100K token,M3 context 1M 完全够;若用 PNG 或超大原图需提前 resize。
5. **`packages/video-agent` 的 Vitest**:vitest 默认用 Node 环境,`fetch` 是 Node 22 内置,无 polyfill 问题。
6. **ffmpeg 流式进度**:参考项目的 `out_time_ms` 解析已经够用,本阶段直接复用,不在 plan 内重新设计。
7. **打包后 ffmpeg 路径**:开发模式用 `pnpm exec ffmpeg`(系统 PATH),打包后用 `process.resourcesPath/bin/<platform>/ffmpeg`。`resolveVideoExportBinaries` 已经覆盖两套逻辑,直接搬过来用,不再自造。

---

## 10. 实施顺序(提交粒度)

1. `chore(monorepo): scaffold packages/video-{agent,project}` —— workspace + package.json + tsconfig + zod 基础类型
2. `feat(media): extractKeyframes with real timestampMs + probeMedia` —— 两个 media 文件 + 单元测试
3. `feat(agent): describeFrames via Minimax M3 (base64)` —— provider 包装 + 集成测试
4. `feat(agent): analyzeAssets wired to real pipeline` —— 把 3 个文件串起来
5. `feat(agent): quality_scoring + auto_bgm + beat_cut` —— 3 个新 agent
6. `feat(export): 4-tier resolution ladder (720p/1080p/2k/4k)` —— schema 扩展 + ffmpeg scale 注入 + UI 控件
7. `feat(ipc): video-agent + export IPC channels` —— 8 个 channel + MiaomaAPI 扩展 + preload
8. `feat(renderer): show M3 description on asset cards + segmented quality control` —— UI 接线
9. `chore(deps): package.json scripts + workspace deps` —— 根 package.json + apps/desktop deps

每个 commit 都跑 `pnpm lint` + `pnpm test:run` + 必要的 `pnpm probe:*`,保证 `main` 分支随时可启动 Electron 壳。

**Phase 5 锚点(本阶段不做,留给后续)**:

- `chore(agent): evaluate LangGraph for checkpoint / resume` —— 评估 LangGraph 是否引入,设计断点续跑
- `feat(electron): custom protocol + Range request` —— 用 `miya://` 协议 + Range 请求替代 `file://`,解决跨域和权限问题
- `feat(dist): code signing + notarization` —— macOS Developer ID + 公证 / Windows 代码签名,避免"未知开发者"警告
- `feat(catalog): expand bundled BGM library` —— 替换动态生成的 6 段 demo,接入正版 BGM 库