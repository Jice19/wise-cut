
import { defineConfig } from 'vite';

// 把 ws + optional native deps 标 external,避免
// esbuild 在 CJS→ESM 转换时对 ws optional peer deps
// (bufferutil / utf-8-validate) 抛 "Could not resolve"。
export default defineConfig({
    build: {
        rollupOptions: {
            external: ['bufferutil', 'utf-8-validate', 'ws']
        }
    }
});
