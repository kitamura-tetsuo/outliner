import { defineConfig, devices } from "@playwright/test";

const TEST_PORT = "7090";
const VITE_HOST = "localhost";

console.log(`E2E Test Configuration:`);
console.log(`- Test port: ${TEST_PORT}`);
console.log(`- Host: ${VITE_HOST}`);

export default defineConfig({
    testDir: "./e2e",
    // Run all Playwright tests in the e2e folder
    testMatch: "**/*.spec.ts",
    fullyParallel: false,
    forbidOnly: !!process.env.CI,
    retries: 0,
    workers: 1,
    reporter: [["list"]],
    timeout: 30 * 1000, // 30 seconds
    expect: {
        timeout: 10 * 1000, // 10 seconds
    },

    use: {
        baseURL: `http://${VITE_HOST}:${TEST_PORT}`,
        trace: "on-first-retry",
        screenshot: "only-on-failure",
        video: "retain-on-failure",
        headless: true,
    },

    projects: [
        {
            name: "basic",
            use: { ...devices["Desktop Chrome"] },
        },
    ],

    webServer: {
        command: `npm run dev -- --host 0.0.0.0 --port ${TEST_PORT}`,
        url: `http://${VITE_HOST}:${TEST_PORT}`,
        reuseExistingServer: !process.env.CI,
        timeout: 60 * 1000, // 1 minute
        env: {
            NODE_ENV: "development", // Use development instead of test
            VITE_PORT: TEST_PORT,
        },
        stdout: "pipe",
        stderr: "pipe",
    },
});
