import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
    testDir: "./e2e/compose-onprem",
    fullyParallel: false,
    workers: 1,
    retries: 0,
    timeout: 180_000,
    expect: { timeout: 30_000 },
    use: { ...devices["Desktop Chrome"], headless: true, trace: "retain-on-failure" },
});
