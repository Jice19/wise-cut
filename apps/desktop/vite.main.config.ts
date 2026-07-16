
import { defineConfig } from 'vite';

export default defineConfig({
    build: {
        rollupOptions: {
            external: ['bufferutil', 'utf-8-validate']
        }
    }
});
