# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概览

AI智能剪辑平台（miaoma-magicut）— pnpm monorepo，包含 Electron 38 桌面端（apps/desktop）与 Next.js 14 服务端占位（apps/server）。

- 包管理：pnpm 10.29.2，**nodeLinker: hoisted**（不要改 isolated）
- Node：22.11.0（volta pin），engines `>=22 <23`
- 工具链：electron-forge 7.10.2 + Vite 5 + React 18 + TS 5.9.3
- 提交规范：cz-git + commitlint + husky 9 + lint-staged

## 常用命令

```bash
# 安装依赖（应 0 error）
pnpm install

# 桌面开发（macOS Dock 出现 Electron 图标）
pnpm start                  # 实际跑 @miaoma-magicut/desktop start

# 桌面打包
pnpm package:mac
pnpm package:win
pnpm make:mac
pnpm make:win

# 服务端（Next.js 占位）
pnpm dev:server
pnpm build:server
pnpm start:server

# Lint / Format / Test
pnpm lint                   # pnpm -r --if-present run lint，递归 workspaces
pnpm format
pnpm test                   # vitest watch
pnpm test:run               # vitest run 单次
pnpm test:coverage
pnpm spellcheck             # cspell

# gitcz 提交
git add .
pnpm commit                 # 弹 cz-git 交互（先过 husky pre-commit，再过 commit-msg）
```

## 架构全景

```
miaoma-magicut/
├── apps/
│   ├── desktop/                          # Electron 38 主仓
│   │   ├── client/                       # 主进程 (main.ts) + preload (preload.ts)
│   │   ├── renderer/                     # 渲染层（React 18 SPA）
│   │   │   ├── index.html                # Vite 入口 HTML
│   │   │   ├── main.tsx                  # ReactDOM.createRoot
│   │   │   ├── App.tsx                   # RouterProvider 壳
│   │   │   ├── router/index.tsx          # createBrowserRouter
│   │   │   ├── pages/                    # 页面（HomeScreen 等）
│   │   │   ├── components/Icon.tsx       # 通用组件
│   │   │   ├── stores/app-store.ts       # zustand store
│   │   │   ├── styles/global.css         # @import "tailwindcss"
│   │   │   └── assets/song/              # 打包进 extraResource 的静态资源
│   │   ├── shared/ipc.ts                 # IPC channel 常量 + Window.miaomaAPI 类型
│   │   ├── bin/{darwin,win32}/           # ffmpeg 等二进制占位（.gitkeep 保留目录）
│   │   ├── forge.config.ts               # electron-forge 配置（不入 FusesPlugin，避开 CJS/ESM 冲突）
│   │   ├── vite.{main,preload,renderer}.config.ts
│   │   ├── vitest.config.ts
│   │   └── tsconfig.json                 # paths: @/* → renderer/*
│   └── server/                           # Next.js 14 App Router 占位
│       ├── app/{layout,page}.tsx         # 仅渲染一行品牌文字
│       ├── app/api/health/route.ts       # GET → { status: 'ok' }
│       └── next.config.ts
├── packages/                             # 预留（空）
├── docs/, scripts/, assets/              # 占位目录
├── eslint.config.mjs                     # ESLint 9 flat config（仓库根，递归生效）
├── .husky/{commit-msg,pre-commit}        # commitlint + lint-staged
└── commitlint.config.cjs                 # cz-git prompt + conventional 规则
```

## IPC 链路（关键架构）

单一事实源在 [apps/desktop/shared/ipc.ts](apps/desktop/shared/ipc.ts)：

- `IPC` 常量：渲染 ↔ 主进程共享 channel 名
- `MiaomaAPI` interface：渲染层通过 `window.miaomaAPI` 可调用的方法签名
- `declare global { interface Window { miaomaAPI: MiaomaAPI } }`：全局类型

主进程 [apps/desktop/client/main.ts](apps/desktop/client/main.ts) 用 `ipcMain.handle(IPC.XXX, ...)` 注册，preload [apps/desktop/client/preload.ts](apps/desktop/client/preload.ts) 通过 `contextBridge.exposeInMainWorld('miaomaAPI', api)` 暴露。

> **新增 IPC 流程**：先在 `shared/ipc.ts` 加 channel 名 + 扩 `MiaomaAPI`，再分别落到 main.ts / preload.ts / 调用方页面。

## Electron Forge 配置要点

- `packagerConfig.extraResource`：`['bin', 'renderer/assets/song']` — **运行时只读，访问路径用 `process.resourcesPath`**
- 不装 `@electron-forge/plugin-fuses` × `@electron/fuses@2.x` —— **CJS/ESM 冲突**；要么不装 plugin-fuses，要么把 fuses 钉 `^1.0.0`
- `prune: false` — 避免 pnpm 产物的 symlink 被剪掉
- 3 个 Vite 入口：`client/main.ts` / `client/preload.ts` / `renderer/main_window`（renderer）

## ESLint 9 flat config

[eslint.config.mjs](eslint.config.mjs) 6 段：

1. 全局 ignores（node_modules、dist、.vite、.next、generated、pnpm-lock）
2. `js.configs.recommended`
3. `tseslint.configs.recommended`
4. TS/TSX 文件：array-type、no-for-in-array、no-console、simple-import-sort（**5 段分组**：node 内置 → `@scope` 第三方 → `@/*` 别名 → 副作用 → 相对父/同级）、simple-import-sort/exports、prettier/prettier；注入 `globals` 含 `MAIN_WINDOW_VITE_DEV_SERVER_URL` / `MAIN_WINDOW_VITE_NAME` / `miaomaAPI`
5. 配置文件（`*.config.ts`、`forge.config.ts`、各 `vite.*.config.ts`、`vitest.config.ts`、`eslint.config.mjs`）：只开 no-console + prettier/prettier
6. 测试文件 (`*.test.ts` / `*.spec.ts`)：放宽 no-console、any

> 文件任何 TS 文件新增 import 后会被 `pnpm lint --fix` 自动按 5 段分组重排。

## Prettier

- `.prettierrc`：tabWidth=4、双引号（overrides 显式声明 typescript parser）
- `.prettierignore`：node_modules / dist / .next / .vite / lock

## 提交工作流（cz-git）

```bash
git add .
pnpm commit
```

弹出 cz-git 交互（emoji + 类型 + scope + subject + body），先触发 husky pre-commit → `lint-staged`（仅 staged 文件跑 `eslint --fix` + `prettier --write`），再触发 commit-msg → `commitlint`，不符合 conventional 规范（缺 type、subject > 72 字符、有句号）会被拒。

提交类型：

| emoji | type | 用途 |
|---|---|---|
| ✨ | feat | 新功能 |
| 🐛 | fix | 修复 |
| 📝 | docs | 文档 |
| 💄 | style | 代码格式 |
| 📦️ | refactor | 重构 |
| 🚀 | perf | 性能 |
| 🚨 | test | 测试 |
| 🛠 | build | 构建 |
| 🎡 | ci | CI |
| 🔨 | chore | 杂项 |
| ⏪️ | revert | 回滚 |

## 环境变量

见 [.env.example](.env.example)：`LLM_MODEL` / `TTS_MODEL` / `BASE_URL` / `API_KEY`（MiniMax-M3 + minimax-speech-01）。开发期复制为 `.env.local`，后者已在 `.gitignore`。

## 关键验收（本仓库已验证）

- [x] `pnpm install` 0 error（907 packages 完成）
- [x] `pnpm exec eslint apps/desktop` 0 error（flat config 加载通过）
- [x] `pnpm exec prettier --check "apps/**/*.{ts,tsx,json,css,md}"` All matched clean
- [x] husky 自动 prepare（`prepare` 脚本已绑定）
- [x] Web 入口 `pnpm start` → Electron 窗口标题 "AI智能剪辑平台"，首屏带 IPC `getVersion()` 验证链路

尚未跑过的：实际启动 Electron GUI（依赖 GUI 环境）、`pnpm package:mac/win`（依赖目标平台工具链）。

## 关键修复（已落在仓库）

> 这些坑都已经在第一次构建过程中遇到并修复，**新增 vite 配置或迁移脚本时请勿反向修改**：

- **renderer 的 vite 配置必须是 `.mjs` 而不是 `.ts`**：`@tailwindcss/vite` 与 `@vitejs/plugin-react` 都是 ESM-only，electron-forge plugin-vite 用 esbuild 加载配置；若配置是 `.ts` 且 apps/desktop/package.json 缺 `"type": "module"`，esbuild 会按 CJS 处理 → `require('@tailwindcss/vite')` 抛 `ESM file cannot be loaded by require`。
  - [apps/desktop/vite.renderer.config.mjs](apps/desktop/vite.renderer.config.mjs) 是 `.mjs`
  - 主进程 / preload 的 vite 配置 `vite.{main,preload}.config.ts` 保持 `.ts`（它们没有 ESM-only 依赖）
  - `forge.config.ts` 的 `renderer.config` 字段指向 `.mjs`
- **vite dev server 监听 `host: '127.0.0.1'` 而不是默认 `localhost`**：macOS 上 vite 5 默认会绑 IPv6 `[::1]`，但 Electron `localhost` 解析走 IPv4 → `net::ERR_CONNECTION_REFUSED`。`lsof -nP -iTCP:5173 -sTCP:LISTEN` 可验证。
- **主进程用 vite `define` 注入的环境变量是裸标识符**：`MAIN_WINDOW_VITE_DEV_SERVER_URL` / `MAIN_WINDOW_VITE_NAME` 不要写 `process.env.MAIN_WINDOW_VITE_DEV_SERVER_URL`，vite define 替换成字符串字面量；用裸 const。模板里已有 type 声明 [node_modules/@electron-forge/plugin-vite/forge-vite-env.d.ts](node_modules/@electron-forge/plugin-vite/forge-vite-env.d.ts)。
- **冷启动重试**：vite dev server 首次冷启动 esbuild 依赖预构建通常 5-10 秒，主进程用 `waitForServer(URL, retries=60, intervalMs=500)` 等待，最多 30 秒窗口后才放弃。
- **开发态自动 DevTools**：[apps/desktop/client/main.ts](apps/desktop/client/main.ts) `app.isPackaged` 为 false 时 `webContents.openDevTools({ mode: 'detach' })`。

## 雷区一览（综合上文关键修复）

| ❌ 禁止 | ✅ 正确做法 |
|---|---|
| `nodeLinker: isolated` | 保持 `hoisted` |
| 装 `plugin-fuses@7.10.2 + fuses@2.0.0` | 不装 plugin-fuses，或 fuses `^1.0.0` |
| `engines.node: '>=22'` 或 `>=20` | `">=22 <23"` + volta pin 22.11.0 |
| 顶层调用 `protocol.registerSchemesAsPrivileged` | 放进 `app.whenReady()` 第一行 |
| ESLint 用传统 `.eslintrc` | flat config (`eslint.config.mjs`) |
| husky v8 写法（手装 `husky install`） | husky 9.x 自动 (`pnpm prepare` 时) |
| `apps/desktop/vite.renderer.config.ts` | `vite.renderer.config.mjs`（防 esbuild CJS 处理） |
| `process.env.MAIN_WINDOW_VITE_DEV_SERVER_URL` | 裸 const（vite define 替换为字符串字面量） |
| vite 默认 `host: 'localhost'`（macOS 会绑 IPv6）| `host: '127.0.0.1'` |

## Electron 异常排查（按观察点定位）

1. **渲染层 DevTools**：dev 模式自动打开（`mode: 'detach'`），Console / Network / Elements 三件套。
2. **主进程 / Preload console**：`pnpm start` 启动的终端 stdout。
3. **Chromium / GPU 内部 stderr**：也走终端，例如 `Failed to load URL`、`Autofill.enable wasn't found`（无害警告）。
4. **vite 是否在监听**：`lsof -nP -iTCP:5173 -sTCP:LISTEN` ——IPv4 `127.0.0.1` 才对，IPv6 `[::1]` Electron 走 IPv4 解析会失败。
5. **冷启动竞态**：vite `httpServer.once('listening')` 回调晚于 Electron 启动窗口 → 主进程 `waitForServer` 已加 30s 窗口；如仍失败，在 DevTools Network 面板看请求是否 `net::ERR_CONNECTION_REFUSED`。
