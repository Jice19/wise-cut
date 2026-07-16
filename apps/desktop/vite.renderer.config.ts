
import path from 'node:path';
import { defineConfig } from 'vite';

import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';

import {
    reactRuntimeAliases,
    reactRuntimeDedupe
} from './react-runtime-resolution';

export default defineConfig({
    plugins: [react(), tailwindcss()],
    resolve: {
        alias: [
            ...reactRuntimeAliases,
            {
                find: '@/renderer',
                replacement: path.resolve(__dirname, 'renderer')
            }
        ],
        dedupe: reactRuntimeDedupe
    }
});
