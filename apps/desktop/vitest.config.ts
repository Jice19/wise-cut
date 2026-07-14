import { fileURLToPath, pathToFileURL } from 'node:url';

import { defineConfig } from 'vitest/config';

const here = fileURLToPath(new URL('.', import.meta.url));

const resolveFromHere = (relativePath: string): string =>
    fileURLToPath(new URL(relativePath, pathToFileURL(here)));

export default defineConfig({
    resolve: {
        alias: {
            '@': resolveFromHere('./renderer'),
            '@miaoma-magicut/video-agent': resolveFromHere(
                '../../packages/video-agent/src/index.ts'
            ),
            '@miaoma-magicut/video-project': resolveFromHere(
                '../../packages/video-project/src/index.ts'
            )
        }
    },
    test: {
        environment: 'node',
        globals: true,
        include: [
            'renderer/**/*.{test,spec}.{ts,tsx}',
            'client/**/*.test.ts',
            'tests/**/*.{test,spec}.ts'
        ],
        // renderer 端的 hook/dialog 测试用 happy-dom(轻量替代 jsdom)
        environmentMatchGlobs: [['renderer/**/*.{test,spec}.tsx', 'happy-dom']]
    }
});
