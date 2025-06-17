import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
    testDir: './e2e/utils',
    testMatch: '*.spec.ts',
    fullyParallel: false,
    reporter: [['list']],
    use: { ...devices['Desktop Chrome'] },
});
