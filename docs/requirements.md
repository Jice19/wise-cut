
> 本文档从现有代码仓库（`wise-cut`）反推得出，用于在 **重写** 之前对齐"这个项目要做什么"。
> 代码仓当前在 `main` 分支，所有 `D apps/desktop/bin/**` 的删除尚未 commit，源代码、配置、依赖都在工作区可见。

---

## 1. 项目定位


**核心场景**：用户在桌面端输入一段文字创意（主题/选题/口播稿），AI Agent 自动完成"分镜脚本 → 视频/图片素材匹配 → 字幕 → 语音合成 → 合成成片"的端到端短视频生成。本地桌面 App 调用本地 FFmpeg 做最终渲染成片。

**形态**：Electron 桌面 App（macOS / Windows），渲染层是 React + Vite，主进程是 Node + IPC 桥。


---

## 2. 目标用户

- **内容创作者 / 短视频运营 / 电商运营**：把"我想做一期讲 XX 的口播"这类自然语言输入，自动化成可发布的成片。

---

## 3. 功能性需求

### 3.1 桌面端核心功能（必做）

| # | 功能 | 入口 | 说明 |
|---|------|------|------|
| F1 | 启动后进入工作区 | `MiaojianWorkspaceScreen` | 项目列表，新建 / 打开 / 删除项目 |
| F2 | 创建项目（Agent 模式） | `MiaojianCreateScreen` → `MiaojianCreateRunScreen` | 文字选题 + 平台/时长/比例配置，提交后 Agent 流式生成 |
| F3 | Agent 流式执行 | `client/video-agent-ipc.ts` + LangGraph | 在 Agent 运行页面看到分镜、素材、脚本、字幕、语音推进状态 |
| F4 | 实时脚本编辑 | `MiaojianEditorScreen` 的 ScriptPanel | 字幕文案编辑、改写 |
| F5 | 实时素材替换 | `Editor` 的 PreviewPanel + TimelinePanel | 替换视频帧 / 缩略图 / 配音 |
| F6 | 视频预览 | PreviewPanel | 在导出前预览合成效果 |
| F7 | 导出成片 | ExportProgressDialog | 通过本地 FFmpeg 渲染最终 mp4 |
| F8 | 字幕开关 / 歌曲开关 | `ConfigPanel` | 字幕样式、是否叠加 BGM、歌曲库选择 |
| F9 | 自定义语音库 | `custom-voice-library.ts` | 用户上传/录制自己的 TTS 音色，可在项目里选用 |
| F10 | 多平台打包分发 | `electron-forge package:mac / package:win` | 同时产 darwin + win32 安装包 |

### 3.2 服务端（最小占位）

- `GET /api/health` 返回健康状态
- 预留 Next.js 路由位（`apps/server/app/api`、`apps/server/prisma` 目录已建空），可后续扩展

### 3.3 数据 / 资产

- **视频项目元数据** 存于本地 `userData` 目录（`app.getPath('userData')`），由 `client/video-project-store.ts` 持久化
- **本地素材**（用户上传的视频/图片/语音）走自定义 `media://` 协议，由 `client/media-protocol.ts` 注册 + 桥接
- **FFmpeg 二进制** 期望放在 `apps/desktop/bin/{darwin,win32}/`，作为 `extraResource` 打进安装包
  - ⚠️ **当前仓库中 `apps/desktop/bin/**` 全部被删除**（git status 显示 `D`），启动后导出功能会失败，需要恢复或重新下载

---

## 4. 非功能性需求

| 维度 | 约束 |
|------|------|
| Node 版本 | `>=22 <23`（来自 `package.json` engines） |
| 包管理器 | pnpm ≥10（仓库带 `pnpm-lock.yaml`、`pnpm-workspace.yaml`） |
| Node 版本管理 | 推荐 volta（其他工具 .nvmrc 也可），但 `pnpm-workspace.yaml` 不要随便改 `nodeLinker`（见兼容性风险章节） |
| 桌面端框架 | Electron 38.x + electron-forge 7.10.2 + Vite 5 插件 |
| 渲染层 | React 18 + react-router-dom 6 + Tailwind v4 + 自研 `reactbits` 动画组件 |
| 状态管理 | zustand（`renderer/stores/*`）+ 自研 IPC 桥 |
| 测试 | vitest（desktop、packages 双侧测试） |
| Lint/Format | ESLint 9 + Prettier 3 + cspell 拼写检查 + commitlint + husky + cz-git |
| 协议 | 自定义 `media://` 协议承载用户本地素材；IPC 用 `ipcMain`/`ipcRenderer` 桥 |

---

## 5. AI 能力（外部 LLM 接入）

当前 `.env.example` 显式 4 个环境变量：

```
LLM_MODEL=doubao-seed-2.0-pro
TTS_MODEL=seed-tts-2.0
BASE_URL=https://ark.cn-beijing.volces.com/api/plan/v3
API_KEY=replace-with-your-volcengine-ark-api-key
```

即默认走 **字节火山方舟 ARK** 的 OpenAI 兼容协议。需要的能力：
- **LLM（文生脚本/分镜）**：默认 `doubao-seed-2.0-pro`
- **TTS（语音合成）**：默认 `seed-tts-2.0`，可被自定义语音库覆盖

> **重构点**：本期需求希望将 BASE_URL / 模型 替换为 MiniMax 全系（详见 `docs/requirements.md` 对应章节 & `docs/plan.md` Phase 3）。

---

## 6. 目录结构（重写时的最小骨架）

```
wise-cut/
├── apps/
│   ├── desktop/                  # Electron 桌面端
│   │   ├── client/               # 主进程 TS（main.ts、preload、IPC 服务）
│   │   ├── renderer/             # 渲染层 React（pages/components/stores/...）
│   │   ├── shared/               # 主/渲染共享的协议、channel 名
│   │   ├── bin/{darwin,win32}/   # ffmpeg/ffprobe/平台 dll
│   │   ├── forge.config.ts       # electron-forge 配置（packager/maker/plugins）
│   │   ├── vite.{main,preload,renderer}.config.ts
│   │   ├── package.json
│   │   └── tests/                # vitest 单测
│   └── server/                   # Next.js 14+ 服务端
│       ├── app/{layout.tsx,page.tsx,api/}
│       ├── prisma/
│       ├── lib/
│       ├── next.config.ts
│       └── package.json
├── packages/
│   ├── video-project/            # 视频项目 schema + validation（Zod）
│   └── video-agent/              # LangGraph Agent 编排（graph/tools/prompts/providers）
├── scripts/
│   └── generate-voice-previews.ts
├── docs/                         # 本文档所在目录
├── package.json
├── pnpm-workspace.yaml
├── pnpm-lock.yaml
└── .env.local                    # 不入库，存 API_KEY 等
```

---

## 7. 重写时**不要**复制的"已知兼容性雷区"

来自这次实际启动的踩坑记录（详见 `plan.md` 兼容性矩阵）：

1. **`pnpm-workspace.yaml` 的 `nodeLinker: hoisted`** —— 是当前仓库能跑通的关键配置（默认 pnpm 是 isolated，但本仓库必须 hoisted）。**重写时请保持 `hoisted`**，否则 Electron 主进程 `require('electron')` 会拿到 npm 包字符串而不是 runtime 注入的 API。
2. **`@electron/fuses` 锁 `2.0.0` 但 `plugin-fuses@7.10.2` 是 CJS** —— `plugin-fuses` 的 peerDep 是 `^1.0.0`，fuses 2.0.0 是 ESM-only，CJS `require(ESM)` 在 Node 22 上时灵时不灵，触发 `forge.config.ts` 加载 `Cannot use 'import.meta' outside a module`。**重写时** 建议把 `fuses` 锁回 `^1.0.0` 或者干脆移除 `FusesPlugin`（普通开发不必要）。
3. **`engines: ">=22 <23"` 没配套 `packageManager` 字段** —— `pnpm` 只会 `WARN` 不会 `ERROR`，子进程 spawn 用什么 Node 由 PATH/shim 决定。**重写时** 推荐在根 `package.json` 同时设 `"packageManager": "pnpm@10.29.2"` 和 `"volta": { "node": "22.x" }`。
4. **`apps/desktop/bin/**` 已被删** —— 是上一笔 commit `a7042ee` 顺带做的。**重写时** 要么用 `pnpm install` 重新拉 ffmpeg（用 `@ffmpeg-installer/ffmpeg` 这类工具），要么从外部下载 `ffmpeg` 静态二进制放回去。

---

## 8. 验收标准

MVP 重写完毕，应满足：

- [ ] `pnpm install` 全程不出现 ELIFECYCLE 错误
- [ ] Vite dev server 在 `http://localhost:5173/`，渲染层可访问
- [ ] 工作区可新建项目、进入 Agent 创建流、跑通一次完整生成
- [ ] 编辑器可改脚本、替换素材
- [ ] 导出对话框走本地 ffmpeg，生成 mp4 落盘
- [ ] `pnpm test` 全绿
- [ ] `pnpm package:mac` 产 darwin 安装包，`pnpm package:win` 产 win32 安装包
- [ ] 切换到 MiniMax 模型后脚本/语音生成可用
