import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
    testDir: "./e2e/onprem",
    testMatch: "**/*.spec.ts",
    fullyParallel: false,
    workers: 1,
    retries: 0,
    timeout: 120_000,
    expect: { timeout: 20_000 },
    use: {
        ...devices["Desktop Chrome"],
        headless: true,
        trace: "retain-on-failure",
    },
});
