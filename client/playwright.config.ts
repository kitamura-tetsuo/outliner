import {
    defineConfig,
    devices,
} from "@playwright/test";

// テスト環境の設定 - AGENTS.mdの指定に従い7090ポートを使用
const TEST_PORT = "7090";
const VITE_HOST = "localhost";

<<<<<<< HEAD
// テスト用ポートを定義 - これを明示的に指定
const TEST_PORT = isLocalhostEnv ? "7090" : "7080";
// Tinylicious サーバーのポートを定義
const TINYLICIOUS_PORT = isLocalhostEnv ? "7092" : "7082";
// ホストを定義
const VITE_HOST = isLocalhostEnv ? "localhost" : "192.168.50.13";
// 環境設定ファイルを定義
const ENV_FILE = ".env.test";

// console.log(`Using test environment: ${isLocalhostEnv ? "localhost" : "default"}`);
// console.log(`Test port: ${TEST_PORT}, Tinylicious port: ${TINYLICIOUS_PORT}, Host: ${VITE_HOST}`);
// console.log(`Environment file: ${ENV_FILE}`);
=======
console.log(`E2E Test Configuration:`);
console.log(`- Test port: ${TEST_PORT}`);
console.log(`- Host: ${VITE_HOST}`);
>>>>>>> c52b2338a152b0584ee5bfa0eb5515abf1f88221

export default defineConfig({
    testDir: "./e2e",
    testMatch: ["basic-simple.spec.ts", "new/TBL-*.spec.ts"], // Run basic tests and table tests
    fullyParallel: false,
    forbidOnly: !!process.env.CI,
    retries: 0,
    workers: 1,
    reporter: [["list"]],
    timeout: 30 * 1000, // 30 seconds
    expect: {
        timeout: 10 * 1000, // 10 seconds
    },

<<<<<<< HEAD
    // globalSetupとglobalTeardown - require.resolveではなく相対パスを使用
    // globalSetup: "./e2e/global-setup.ts",
    // globalTeardown: "./e2e/global-teardown.ts",

    use: {
        // Clipboard APIを有効にするためにlocalhostを使用
        baseURL: `http://localhost:7090`,
=======
    use: {
        baseURL: `http://${VITE_HOST}:${TEST_PORT}`,
>>>>>>> c52b2338a152b0584ee5bfa0eb5515abf1f88221
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
