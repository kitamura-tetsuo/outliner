import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
    testDir: "./e2e/onprem",
    testMatch: "**/*.control.ts",
    outputDir: "test-results-negative-control",
    workers: 1,
    retries: 0,
    timeout: 30_000,
    use: { ...devices["Desktop Chrome"], headless: true },
});
