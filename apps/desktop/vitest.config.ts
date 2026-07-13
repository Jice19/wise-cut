import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

const here = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
    resolve: {
        alias: {
            '@': `${here}renderer`,
            '@miaoma-magicut/video-agent': `${here}../../packages/video-agent/src/index.ts`,
            '@miaoma-magicut/video-project': `${here}../../packages/video-project/src/index.ts`
        }
    },
    test: {
        environment: 'node',
        globals: true,
        include: [
            'renderer/**/*.{test,spec}.{ts,tsx}',
            'client/**/*.test.ts',
            'tests/**/*.{test,spec}.ts'
        ]
    }
});
