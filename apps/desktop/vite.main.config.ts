import { defineConfig } from 'vite';

// commit 20.4:不在打包时强制解析 ws 的 optional deps(bufferutil /
// utf-8-validate)。esbuild 不知道 optional 标记会 ESM 静态解析失败:
// "Could not resolve 'bufferutil' imported by 'ws'."
// 实际运行时 ws 在 ws/dist/index.js 里 fallback 到纯 JS,
// optional native binding 不强制需要。
export default defineConfig({
    build: {
        rollupOptions: {
            // 显式标 ws 为 external —— electron 进程 runtime 通过 node 原生
            // require resolution 找 node_modules/ws,直接拿 ws 完整 dist bundle,
            // 跳过 esbuild 预构建 optional deps 时崩。
            external: ['electron', 'electron-squirrel-startup', 'ws']
        }
    },
    clearScreen: false,
    optimizeDeps: {
        exclude: ['ws']
    },
    server: {
        port: 5173,
        strictPort: true
    }
});
