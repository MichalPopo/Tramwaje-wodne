import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        globals: true,
        environment: 'node',
        coverage: {
            provider: 'v8',
            reporter: ['text', 'text-summary', 'html'],
            include: ['src/**/*.ts'],
            exclude: ['src/types/**', 'src/index.ts'],
            thresholds: {
                statements: 95,
                branches: 85,
                functions: 100,
                lines: 95,
            },
        },
    },
});
