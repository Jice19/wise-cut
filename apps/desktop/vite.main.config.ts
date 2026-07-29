import { defineConfig } from 'vite';

// 主进程构建配置:
// 1. electron-forge VitePlugin 默认会 externalize apps/desktop/package.json 里的 dependencies
// 2. 但 workspace 包(@wise-cut/video-agent)内部的 langgraph / openai 等重依赖不在
//    desktop 的 dependencies 里,所以 Vite 还会把它们的 JS 全部卷进 main.js
// 3. 这里显式 externalize,让它们留在 node_modules 走 require 加载
//
// 修改理由:之前 main.js 膨胀到 2.78MB / 7.9 万行,核心原因就是没 externalize 这些。
const heavyNodeDeps = [
    '@langchain/langgraph',
    '@langchain/langgraph-checkpoint-sqlite',
    '@langchain/openai',
    'better-sqlite3',
    'bufferutil',
    'utf-8-validate',
    'ws',
    'zod',
    'dotenv'
];

export default defineConfig({
    build: {
        target: 'node22',
        minify: false,
        sourcemap: false,
        // 不清空 outDir,保留 preload 编译产物
        emptyOutDir: false,
        // electron 主进程是 CJS,需要 .js 后缀 + CJS 格式
        rollupOptions: {
            external: heavyNodeDeps,
            output: {
                format: 'cjs',
                entryFileNames: 'main.js',
                chunkFileNames: 'main-[name].js',
                inlineDynamicImports: true
            }
        }
    }
});
