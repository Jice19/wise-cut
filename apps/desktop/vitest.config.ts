import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        environment: 'jsdom',
        globals: true,
        include: ['renderer/**/*.{test,spec}.{ts,tsx}', 'client/**/*.test.ts']
    }
});
