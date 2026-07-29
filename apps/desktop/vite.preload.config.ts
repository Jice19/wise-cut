import { defineConfig } from 'vite';

// preload 脚本构建配置:
// - electron preload 跑在 CJS 环境(虽然新版也能用 ESM,但和 main 保持一致最稳)
// - 输出 .js 后缀,跟 main 入口约定对齐
// - inlineDynamicImports: preload 不允许异步 import(走 contextBridge 必须是同步的)
export default defineConfig({
    build: {
        target: 'node22',
        minify: false,
        sourcemap: false,
        // 不清空 outDir,保留 main 编译产物
        emptyOutDir: false,
        rollupOptions: {
            output: {
                format: 'cjs',
                entryFileNames: 'preload.js',
                inlineDynamicImports: true
            }
        }
    }
});
