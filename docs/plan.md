
> 重写时**强烈建议**保留"已知兼容性雷区"那几项（见 `requirements.md §7`），否则会重复本次踩坑。

---

## 0. 总体策略

- **技术栈不动**：Electron 38 + electron-forge 7.10.2 + Vite + React 18 + Tailwind v4 + zustand + LangGraph + FFmpeg
- **目录结构不动**：monorepo（apps/desktop、apps/server、packages/video-project、packages/video-agent）
- **包管理器不动**：pnpm + hoisted nodeLinker
- **从 0 重写代码逻辑**（保留接口形态），重点是修掉原仓库的兼容性 bug，并按 MiniMax 重构 AI 接入层

---

## 1. 阶段划分

| Phase | 名称 | 关键交付 |
|---|---|---|
| 0 | 脚手架 | 干净的可启动 Electron 窗口（空 renderer） |
| 1 | 数据层 | `video-project` schema + store + 自定义协议 |
| 2 | 主进程 IPC | 项目 CRUD IPC + 媒体协议桥 + 自定义语音库 |
| 3 | AI 接入层 | LangGraph Agent 编排 + MiniMax 兼容 provider |
| 4 | 渲染层 | 工作区 / 创建 / 编辑器 / 配置 / 导出 5 个页面 |
| 5 | 视频导出 | FFmpeg 拼装 / 烧字幕 / 叠 BGM / 多平台渲染 |
| 6 | 打包分发 | macOS / Windows 安装包 + 持续集成 |
| 7 | 测试与质量 | vitest 全量 + 关键 E2E |

---

## 2. Phase 0 — 脚手架（≈ 1 小时）

### 2.1 仓库根

`package.json`：

```json
{
  "name": "wise-cut",
  "private": true,
  "engines": { "node": ">=22 <23" },
  "volta": { "node": "22.11.0" },
  "packageManager": "pnpm@10.29.2",
  "scripts": {
    "start": "pnpm --filter @wise-cut/desktop start",
    "dev:desktop": "pnpm --filter @wise-cut/desktop start",
    "dev:server": "pnpm --filter @wise-cut/server dev",
    "package:mac": "pnpm --filter @wise-cut/desktop package:mac",
    "package:win": "pnpm --filter @wise-cut/desktop package:win",
    "make:mac": "pnpm --filter @wise-cut/desktop make:mac",
    "make:win": "pnpm --filter @wise-cut/desktop make:win",
    "lint": "pnpm -r --if-present run lint",
    "format": "pnpm -r --if-present run format",
    "test": "pnpm -r --if-present run test",
    "prepare": "husky"
  }
}
```

`pnpm-workspace.yaml`（**保留 hoisted**）：

```yaml
packages:
  - "apps/*"
  - "packages/*"
nodeLinker: hoisted
blockExoticSubdeps: false
allowBuilds:
  electron: true
  electron-winstaller: true
  esbuild: true
  sharp: true
```

> ⚠️ 改 `nodeLinker` 为 `isolated` 会导致 Electron 主进程 `require('electron')` 拿到 npm 包字符串而不是 runtime 注入的 API。

### 2.2 apps/desktop 关键依赖

```jsonc
{
  "name": "@wise-cut/desktop",
  "main": ".vite/build/main.js",
  "scripts": {
    "start": "electron-forge start",
    "package:mac": "electron-forge package --platform darwin",
    "package:win": "electron-forge package --platform win32 --arch x64",
    "make:mac": "electron-forge make --platform darwin",
    "make:win": "electron-forge make --platform win32 --arch x64"
  },
  "dependencies": {
    "@wise-cut/video-agent": "workspace:*",
    "@wise-cut/video-project": "workspace:*",
    "electron-squirrel-startup": "^1.0.0",
    "react": "^18.3.0",
    "react-dom": "^18.3.0",
    "react-router-dom": "^6.26.0",
    "zustand": "^4.5.0"
  },
  "devDependencies": {
    "@electron-forge/cli": "7.10.2",
    "@electron-forge/plugin-vite": "7.10.2",
    "@electron-forge/maker-squirrel": "7.10.2",
    "@electron-forge/maker-zip": "7.10.2",
    "@electron-forge/maker-rpm": "7.10.2",
    "@electron-forge/maker-deb": "7.10.2",
    "electron": "38.4.0",
    "vite": "^5.4.0",
    "@vitejs/plugin-react": "^4.3.0",
    "tailwindcss": "^4.1.0",
    "@tailwindcss/vite": "^4.1.0",
    "vitest": "^2.1.0"
  }
}
```

> ❗ **不要**装 `@electron-forge/plugin-fuses` 7.10.2 + `@electron/fuses@2.0.0` 这个组合（CJS/ESM 冲突，会让 `forge.config.ts` 加载失败）。要么不装 `plugin-fuses`，要么把 `fuses` 钉成 `^1.0.0`。

### 2.3 main.ts 最小骨架

```ts
import { app, BrowserWindow } from 'electron';

const createWindow = () => {
  const win = new BrowserWindow({ width: 1480, height: 940 });
  win.loadURL(process.env.MAIN_WINDOW_VITE_DEV_SERVER_URL || 'http://localhost:5173');
};

app.whenReady().then(createWindow);
app.on('window-all-closed', () => process.platform !== 'darwin' && app.quit());
```

启动后应该看到空白窗口。**不要** 立刻复制原仓库的 `registerMediaProtocolSchemePrivileges()` 这种顶层协议注册。

### 2.4 验证清单

- [ ] `pnpm install` 0 error
- [ ] `pnpm start` 启动后 macOS Dock 出现 Electron 图标
- [ ] `http://localhost:5173/` 渲染出 Vite 欢迎页

---

## 3. Phase 1 — 数据层（≈ 2 小时）

### 3.1 packages/video-project

导出 `types.ts`（项目/资产/Agent 运行的类型）、`schema.ts`（Zod）、`validation.ts`、`index.ts`。

```ts
// packages/video-project/src/types.ts
export type MediaAssetKind = 'video' | 'voice' | 'thumbnail';
export type MediaAsset<T extends MediaAssetKind = MediaAssetKind> = {
  id: string;
  kind: T;
  path: string;        // 本地绝对路径
  durationMs?: number;
};
export type VideoProject = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  assets: { videos: MediaAsset<'video'>[]; voices: MediaAsset<'voice'>[]; thumbnails: MediaAsset<'thumbnail'>[] };
  script: SubtitleSegment[];
  config: { subtitle: SubtitleConfig; music?: MusicConfig; voice: VoiceConfig };
};
```

### 3.2 `custom-voice.ts` / `media-protocol.ts`（shared）

- `mediaProtocolScheme = 'media'`
- `parseMediaAssetUrl(url) → { projectId, kind, assetId }`
- `parseCustomVoicePreviewUrl(url) → { voiceId }`

---

## 4. Phase 2 — 主进程 IPC（≈ 4 小时）

### 4.1 `client/main.ts` 启动顺序

```ts
import { app, BrowserWindow, ipcMain, protocol, net } from 'electron';
import path from 'node:path';

// 1. 必须在 app ready 之前注册 scheme privileges
protocol.registerSchemesAsPrivileged([
  { scheme: 'media', privileges: { secure: true, standard: true, stream: true, supportFetchAPI: true } }
]);

app.whenReady().then(async () => {
  // 2. ready 之后注册 protocol.handle
  protocol.handle('media', createMediaProtocolHandler({ store }));
  // 3. 注册 IPC handlers
  registerVideoProjectIpc({ ipcMain, store });
  registerCustomVoiceIpc({ ipcMain, library });
  registerVideoExportIpc({ ipcMain, ... });
  registerVideoAgentIpc({ ipcMain, controller });
  // 4. 最后建窗口
  createWindow();
});
```

> ⚠️ 原仓库的 `registerMediaProtocolSchemePrivileges()` 在 `import` 后**模块顶层**调用，这正是踩坑的入口。新版一律放进 `app.whenReady()` 的**第一行**（在 `protocol.handle` 之前），保证调用顺序与 Electron 文档一致。

### 4.2 `client/video-project-store.ts`

- 路径：`app.getPath('userData')/projects`
- 每个项目一个 `index.json` + `assets/` 子目录
- API：`createProject / readProjectById / listProjects / updateProject / deleteProject`

### 4.3 `client/custom-voice-library.ts`

- 路径：`app.getPath('userData')/custom-voices`
- 录音/上传音色文件 + 名字
- `resolveReferencePath(voiceId) → string`

### 4.4 IPC 桥（`preload.ts`）

- 暴露 `window.miaoma = { projects, customVoices, videoExport, videoAgent }`
- 类型在 `shared/*-channels.ts` 集中声明

---

## 5. Phase 3 — AI 接入层（≈ 4 小时，**含 MiniMax 替换**）

### 5.1 LLM / TTS provider 抽象

```ts
// packages/video-agent/src/providers/types.ts
export interface LlmProvider {
  chat(messages: ChatMessage[], opts?: { json?: boolean }): Promise<string>;
  chatStream(messages: ChatMessage[]): AsyncIterable<string>;
}
export interface TtsProvider {
  synthesize(text: string, voice: VoiceConfig): Promise<{ audio: Buffer; mime: string }>;
}
```

### 5.2 MiniMax provider（替换原 doubao）

`packages/video-agent/src/providers/minimax.ts`：

```ts
const BASE_URL = process.env.BASE_URL!;   // MiniMax 的 OpenAI 兼容 endpoint
const API_KEY  = process.env.API_KEY!;
const LLM_MODEL = process.env.LLM_MODEL!; // 例如 'MiniMax-M3'
const TTS_MODEL = process.env.TTS_MODEL!; // MiniMax 语音模型

export const createMiniMaxLlm = (): LlmProvider => ({
  async chat(messages, { json } = {}) {
    const r = await fetch(`${BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: LLM_MODEL,
        messages,
        response_format: json ? { type: 'json_object' } : undefined
      })
    });
    if (!r.ok) throw new Error(`LLM ${r.status}: ${await r.text()}`);
    const data = await r.json();
    return data.choices[0].message.content;
  },
  async *chatStream(messages) {
    const r = await fetch(`${BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: LLM_MODEL, messages, stream: true })
    });
    if (!r.ok) throw new Error(`LLM stream ${r.status}: ${await r.text()}`);
    // 解析 SSE，逐行 yield content delta
    const reader = r.body!.getReader();
    const decoder = new TextDecoder();
    let buf = '';
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split('\n'); buf = lines.pop() ?? '';
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const payload = line.slice(6).trim();
        if (payload === '[DONE]') return;
        try { const j = JSON.parse(payload); const d = j.choices?.[0]?.delta?.content; if (d) yield d; } catch {}
      }
    }
  }
});
```

`.env.local`（MiniMax 替换）：

```ini
LLM_MODEL=MiniMax-M3
TTS_MODEL=minimax-speech-01
BASE_URL=https://api.MiniMax.com/v1     # 替换为 MiniMax 实际 base URL
API_KEY=sk-xxxxxxxxxxxx
```

> **落地前** 你需要拿到 MiniMax 的具体 base URL 和 `chat/completions` / `audio/speech` 的请求/响应示例，因为不同厂商字段名（`audio`/`audio_url`/二进/十六进制）不一样。Phase 3 开始前确认。

### 5.3 LangGraph 编排（`packages/video-agent/src/graph`）

节点顺序（沿用原仓库语义）：
1. `parseTopic` — LLM 解析用户选题，提取主题/平台/时长/比例
2. `planScenes` — LLM 出分镜 JSON（每镜 1 句口播 + 关键词 + 建议素材类型）
3. `matchMedia` — 工具调用 LLM/搜索 API 找视频/图片素材
4. `generateScript` — LLM 精修字幕文案
5. `synthesizeVoices` — TTS 一次性合成所有分镜语音
6. `composeVideo` — 调用 `videoExportIpc` 让主进程跑 FFmpeg

工具节点在 `packages/video-agent/src/tools`：

- `match-stock-video(query, durationMs)` — 走 MiniMax 多模态搜索或预留 mock
- `tts(scenes, voiceConfig)` — 走 `TtsProvider`
- `export-video(projectId, script, voice, config)` — 走 IPC 调主进程

---

## 6. Phase 4 — 渲染层（≈ 6 小时）

按原仓库页面顺序实现：

| 页面 | 文件 | 状态 |
|------|------|------|
| 工作区 | `renderer/pages/MiaojianWorkspaceScreen.tsx` | 项目列表、新建/打开/删除 |
| 创建（首页） | `MiaojianCreateScreen.tsx` | 选题输入、模式切换 |
| 创建（执行） | `MiaojianCreateRunScreen.tsx` | Agent 进度条 + 实时日志 |
| 编辑器 | `MiaojianEditorScreen.tsx` + `MiaojianEditorRoute.tsx` | ScriptPanel + PreviewPanel + TimelinePanel + ConfigPanel |
| 导出 | `ExportProgressDialog.tsx` | FFmpeg 进度展示 |

**关键组件**（保留原命名）：
- `AssistantPanel`、`ModeRail`、`EditorHeader`、`Icon`、`IconButton`
- `agent/AgentConversationTimeline.tsx`、`agent/AgentRunStageNav.tsx`
- `config/{subtitle,visual,voice,music,shared}/*`
- `create/{CreateHero,CreateInputPanel,CreateMainContent,CreateModeSwitch,VoiceSelect,GradientText,CreateAgentProgress}.tsx`

**Stores**（`renderer/stores/agent-run-store.ts`）：用 zustand，订阅 IPC 事件把 Agent 流式输出落到 store。

**路由**：`renderer/router/index.ts` 用 `createBrowserHistory` + `react-router-dom` 6 的 `createBrowserRouter`。

---

## 7. Phase 5 — 视频导出（≈ 3 小时）

### 7.1 `client/video-export-binaries.ts`

FFmpeg 路径解析（**按运行模式**）：

- **开发模式**：从 `apps/desktop/bin/<platform>/ffmpeg` 读（用 `process.platform` 选）
- **打包后**：从 `process.resourcesPath/ffmpeg`（即 `extraResource` 解压目录）读

### 7.2 `client/video-export-ffmpeg.ts`

核心 ffmpeg 命令组装：

```bash
# 1. 多路视频按时间轴 concat
ffmpeg -f concat -safe 0 -i list.txt -c copy base.mp4

# 2. 烧字幕（ASS 样式）
ffmpeg -i base.mp4 -vf "ass=subtitle.ass" with_sub.mp4

# 3. 叠 BGM（可选）
ffmpeg -i with_sub.mp4 -i bgm.mp3 -filter_complex "[1:a]volume=0.3[a]" -map 0:v -map "[a]" final.mp4
```

> **Phase 7 验收**之前 `apps/desktop/bin/{darwin,win32}/` 下的 ffmpeg/ffprobe/平台 dll 必须就位（`pnpm install` 不带 ffmpeg，需手动 `pnpm install --save-dev @ffmpeg-installer/ffmpeg @ffmpeg-installer/win32-x64` 然后在 `video-export-binaries.ts` 复制到 bin 目录，或者直接走 `@ffmpeg-installer/ffmpeg` 提供的路径）。

### 7.3 进度事件

`emitProgress: (stage, percent) => void` 经 IPC 推到渲染层，进度条显示。

---

## 8. Phase 6 — 打包分发（≈ 2 小时）

`forge.config.ts` 模板（**注意：不要带 FusesPlugin**）：

```ts
import { MakerSquirrel } from '@electron-forge/maker-squirrel';
import { MakerZIP } from '@electron-forge/maker-zip';
import { MakerRpm } from '@electron-forge/maker-rpm';
import { MakerDeb } from '@electron-forge/maker-deb';
import { VitePlugin } from '@electron-forge/plugin-vite';
import type { ForgeConfig } from '@electron-forge/shared-types';

const config: ForgeConfig = {
  packagerConfig: {
    extraResource: ['bin', 'renderer/assets/song'],
    prune: false
  },
  rebuildConfig: {},
  makers: [
    new MakerSquirrel({}),
    new MakerZIP({}, ['darwin', 'win32']),
    new MakerRpm({}),
    new MakerDeb({})
  ],
  plugins: [
    new VitePlugin({
      build: [
        { entry: 'client/main.ts',    config: 'vite.main.config.ts',    target: 'main' },
        { entry: 'client/preload.ts', config: 'vite.preload.config.ts', target: 'preload' }
      ],
      renderer: [
        { name: 'main_window', config: 'vite.renderer.config.ts' }
      ]
    })
  ]
};

export default config;
```

构建：

```bash
pnpm package:mac   # out/make/.../dmg
pnpm package:win   # out/make/.../exe
```

---

## 9. Phase 7 — 测试与质量

- `vitest` 单测覆盖：
  - `video-project` schema / validation
  - `video-project-store` 持久化
  - `media-protocol` URL 解析
  - `custom-voice-library` 增删查
  - `video-export` ffmpeg 命令组装
  - `video-agent` graph 节点逻辑（用 mock provider）
- E2E（可选）：spectron 或 playwright-electron 跑一条"建项目 → 编辑 → 导出"全链路

---

## 10. 兼容性矩阵（必看，避免重蹈覆辙）

| 配置项 | 推荐值 | 不推荐 | 后果 |
|--------|--------|--------|------|
| `pnpm-workspace.yaml` `nodeLinker` | `hoisted` | `isolated` | Electron 主进程 `require('electron')` 拿到 npm 包字符串 |
| `@electron/fuses` 版本 | `^1.0.0` 或不装 | `2.0.0` + `plugin-fuses@7.10.2` | CJS/ESM 冲突，`forge.config.ts` 加载失败 |
| `engines.node` | `>=22 <23` | `>=22` 或 `>=20` | Electron 38 postinstall 在 Node 24 解包失败 |
| Volta pin | `22.11.0`（根 `package.json`） | 不设 | 终端默认 24，启动 WARN 噪音 |
| `packageManager` | `pnpm@10.29.2` | 不设 | pnpm 不锁版本，团队成员漂移 |
| `extraResource` | `['bin', 'renderer/assets/song']` | 漏 `bin` | 导出时找不到 ffmpeg |
| `protocol.registerSchemesAsPrivileged` | `app.whenReady()` 第一行 | 模块顶层立即调用 | ESM bundle 下 `protocol` 可能是 undefined |
| ffmpeg 二进制 | `apps/desktop/bin/{darwin,win32}/` 放好 | 留空 | 导出报 ENOENT |

---

## 11. 关键文件清单（重写时优先读/改）

| 优先级 | 文件 | 用途 |
|--------|------|------|
| P0 | `apps/desktop/forge.config.ts` | packager/maker/plugins |
| P0 | `apps/desktop/client/main.ts` | 主进程入口（IPC 注册顺序） |
| P0 | `apps/desktop/client/media-protocol.ts` | 自定义协议桥 |
| P0 | `apps/desktop/client/preload.ts` | contextBridge |
| P0 | `pnpm-workspace.yaml` | `nodeLinker: hoisted` |
| P0 | `package.json` | `engines`/`volta`/`packageManager` |
| P1 | `apps/desktop/client/video-project-store.ts` | 本地项目持久化 |
| P1 | `apps/desktop/client/custom-voice-library.ts` | 语音库管理 |
| P1 | `apps/desktop/client/video-export-service.ts` | ffmpeg 调度 |
| P1 | `apps/desktop/client/video-export-ffmpeg.ts` | ffmpeg 命令组装 |
| P1 | `apps/desktop/client/video-agent-ipc.ts` | Agent IPC 桥 |
| P1 | `packages/video-agent/src/graph/*` | LangGraph 编排 |
| P1 | `packages/video-agent/src/providers/*` | LLM/TTS provider（**MiniMax 接入点**） |
| P2 | `apps/desktop/renderer/pages/*` | 5 个页面 |
| P2 | `apps/desktop/renderer/components/*` | 组件 |
| P2 | `apps/desktop/renderer/stores/agent-run-store.ts` | zustand store |

---

## 12. MiniMax 接入核对清单

对接 MiniMax 前请向 MiniMax 方确认：

- [ ] **Base URL**（如 `https://api.MiniMax.cn/v1`）
- [ ] **鉴权方式**（`Authorization: Bearer <API_KEY>`？还是有 `X-Source-Token` 之类的额外头？）
- [ ] **LLM chat/completions 路径与请求/响应示例**（OpenAI 兼容？还是 MiniMax 自有 schema？）
- [ ] **TTS 路径与请求/响应**（返回 mp3 buffer？base64？audio_url？）
- [ ] **M3 长上下文**（1M context window 在 SDK 里要不要显式声明？max_tokens 上限？）
- [ ] **视频生成接口**（如果需要 MiniMax 生视频，3 条/日限速是否硬限？请求参数示例？）
- [ ] **4–5 个 Agent 并发** 是否需要 SDK 层限流/队列？还是有内置并发槽？

拿到上述信息后，按 `5.2` 的模板把 `minimax.ts` 实现，**只动 `providers/` 和 `providers/types.ts`**，上层 graph / tools / IPC 不动。
