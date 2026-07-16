
import { defineConfig } from 'vitest/config';

import {
    reactRuntimeAliases,
    reactRuntimeDedupe
} from './react-runtime-resolution';

export default defineConfig({
    resolve: {
        alias: reactRuntimeAliases,
        dedupe: reactRuntimeDedupe
    },
    test: {
        globals: true,
        environment: 'node',
        include: ['tests/**/*.test.ts'],
        coverage: {
            provider: 'v8',
            reporter: ['text', 'json', 'html']
        }
    }
});
