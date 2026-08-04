import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
    testDir: "./e2e/deployed",
    fullyParallel: false,
    workers: 1,
    retries: 0,
    timeout: 120000,
    expect: { timeout: 30000 },
    use: {
        ...devices["Desktop Chrome"],
        baseURL: process.env.DEPLOYED_DEMO_URL ?? "https://outliner-d57b0.web.app",
        headless: true,
        ignoreHTTPSErrors: true,
        permissions: ["clipboard-read", "clipboard-write"],
        screenshot: "only-on-failure",
        trace: "retain-on-failure",
    },
});
