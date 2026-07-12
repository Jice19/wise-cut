import { defineConfig } from 'vite';

export default defineConfig({
    build: {
        rollupOptions: {
            external: ['electron', 'electron-squirrel-startup']
        }
    },
    clearScreen: false,
    server: {
        port: 5173,
        strictPort: true
    }
});
