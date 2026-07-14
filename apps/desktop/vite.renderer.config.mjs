import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));

// 必须是 .mjs：@tailwindcss/vite 是 ESM-only，electron-forge plugin-vite 用 esbuild
// 加载此配置；若为 .ts 且项目 package.json 缺 "type":"module"，esbuild 会按 CJS 处理，
// 然后在 require('@tailwindcss/vite') 时报 "ESM file cannot be loaded by require"。
export default defineConfig({
    // renderer 入口 index.html 位于 apps/desktop/renderer/，需要让 vite 把这里
    // 当作根目录。改成绝对路径,避免 electron-forge plugin-vite 跑 vite
    // 时 cwd 跟仓库根目录不同时 'renderer' 解析到错误位置(导致
    // 加载根路径返回 404,renderer 拿到空白页)。
    root: resolve(here, 'renderer'),
    resolve: {
        // 与 tsconfig.json 的 `paths: { "@/*": ["renderer/*"] }` 对齐——vite 不读 tsconfig，
        // 必须显式声明 alias。
        alias: {
            '@': resolve(here, 'renderer')
        }
    },
    plugins: [react(), tailwindcss()],
    clearScreen: false,
    server: {
        // 显式监听 IPv4 loopback。macOS 上 'localhost' 默认解析到 127.0.0.1，
        // 但 vite 5 默认会绑定 IPv6 [::1]，导致 Electron `localhost:5173` 失败。
        host: '127.0.0.1',
        port: 5173,
        strictPort: true
    }
});
