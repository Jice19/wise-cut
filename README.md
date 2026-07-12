# AI智能剪辑平台（miaoma-magicut）

pnpm monorepo · Electron 38 桌面端 + Next.js 14 服务端占位。

## 环境

- Node ≥22 <23（volta pin 22.11.0）
- pnpm 10.29.2（`nodeLinker: hoisted`）

## 安装 & 启动

```bash
pnpm install            # 0 error
pnpm start              # 桌面端：http://localhost:5173 + Electron 窗口
pnpm dev:server         # 服务端占位
```

## 目录

- `apps/desktop` — Electron 38 + electron-forge 7 + Vite 5 + React 18
- `apps/server` — Next.js 14 占位
- `packages/` — 预留共享包

## 提交规范

```bash
git add .
pnpm commit             # cz-git 交互（emoji + type + scope + subject）
```

提交会被 husky pre-commit → lint-staged → ESLint --fix + Prettier；commit-msg → commitlint 校验 conventional 规范。

详细架构、关键修复与雷区见 [CLAUDE.md](CLAUDE.md)。
