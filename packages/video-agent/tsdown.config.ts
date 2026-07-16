/* */
import { defineConfig } from 'tsdown';

export default defineConfig({
    clean: true,
    deps: {
        neverBundle: [/^node:/]
    },
    dts: true,
    entry: ['./src/index.ts'],
    format: ['esm'],
    platform: 'node'
});
