import { fileURLToPath, pathToFileURL } from 'node:url';

import { defineConfig } from 'vitest/config';

const here = fileURLToPath(new URL('.', import.meta.url));

const resolveFromHere = (relativePath: string): string =>
    fileURLToPath(new URL(relativePath, pathToFileURL(here)));

export default defineConfig({
    resolve: {
        alias: {
            '@miaoma-magicut/video-project': resolveFromHere('./src/index.ts')
        }
    },
    test: {
        environment: 'node',
        globals: true,
        include: ['tests/**/*.{test,spec}.ts']
    }
});
