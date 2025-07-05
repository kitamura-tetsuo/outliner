import { defineConfig, devices } from "@playwright/test";
import path from "path";
import { fileURLToPath } from "url";

// ESモジュールで__dirnameを使うための設定
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// テスト環境の設定
// 環境変数TEST_ENVが'localhost'の場合はlocalhost環境、それ以外はデフォルト環境
// VSCode Playwright拡張から実行する場合は環境変数が正しく渡らないことがあるため、
// 必要に応じて直接trueに設定してください
const isLocalhostEnv = process.env.TEST_ENV === "localhost" || true; // デフォルトでlocalhostを使用

// テスト用ポートを定義 - これを明示的に指定
const TEST_PORT = isLocalhostEnv ? "7090" : "7080";
// Tinylicious サーバーのポートを定義
const TINYLICIOUS_PORT = isLocalhostEnv ? "7092" : "7082";
// ホストを定義
const VITE_HOST = process.env.VITE_HOST || "localhost";
// 環境設定ファイルを定義
const ENV_FILE = isLocalhostEnv ? ".env.localhost.test" : ".env.test";

// console.log(`Using test environment: ${isLocalhostEnv ? "localhost" : "default"}`);
// console.log(`Test port: ${TEST_PORT}, Tinylicious port: ${TINYLICIOUS_PORT}, Host: ${VITE_HOST}`);
// console.log(`Environment file: ${ENV_FILE}`);
export default defineConfig({
    testDir: "./e2e",
    testMatch: "**/*.spec.ts",
    fullyParallel: true,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 10 : 0,
    workers: process.env.CI ? 2 : 4,
    maxFailures: process.env.CI ? 1 : 5,

    reporter: [["html", { open: "never" }]],
    headless: true,
    // テスト実行時のタイムアウト設定を延長
    timeout: 30 * 1000, // 30秒
    expect: {
        // 要素の検出待機のタイムアウト設定を延長
        timeout: 15 * 1000, // 15秒
    },

    use: {
        ...devices["Desktop Chrome"],
        // Chromium用のタイムアウト設定を延長
        launchOptions: {
            // 共有メモリの問題を回避するためのオプション
            args: [
                "--no-sandbox",
                "--disable-setuid-sandbox",
                "--disable-dev-shm-usage",
                "--disable-gpu",
                "--disable-web-security",
                "--disable-features=VizDisplayCompositor",
                "--disable-background-timer-throttling",
                "--disable-backgrounding-occluded-windows",
                "--disable-renderer-backgrounding",
                "--memory-pressure-off",
                "--max_old_space_size=4096",
                "--disable-extensions",
                "--disable-plugins",
                "--run-all-compositor-stages-before-draw",
                "--disable-ipc-flooding-protection",
                // 共有メモリサイズを明示的に指定
                "--shm-size=1gb",
                "--allow-file-access-from-files",
                "--enable-clipboard-read",
                "--enable-clipboard-write",
            ],
        },
        // Clipboard APIを有効にするためにlocalhostを使用
        baseURL: `http://${VITE_HOST}:${process.env.TEST_PORT || TEST_PORT}`,
        trace: "on-first-retry",
        // クリップボードへのアクセスを許可
        permissions: ["clipboard-read", "clipboard-write"],
    },

    projects: [
        {
            // 基本テスト: 環境確認や最小構成の検証用
            name: "basic",
            testDir: "./e2e/basic",
        },
        {
            // 新機能テスト
            name: "new",
            testDir: "./e2e/new",
        },
        {
            // コアテスト: 認証不要の基本機能テスト
            name: "core",
            testDir: "./e2e/core",
        },
        {
            // 認証テスト: 本番環境でのみ実行
            name: "auth",
            testDir: "./e2e/auth",
        },
        {
            // ユーティリティテスト: 共通機能のテスト
            name: "utils",
            testDir: "./e2e/utils",
        },
    ],
    // webServer: {
    //     command: `npx dotenv -e .env.test -- npm run dev -- --host 0.0.0.0 --port ${TEST_PORT}`,
    //     url: `http://localhost:${TEST_PORT}`,
    //     reuseExistingServer: !process.env.CI,
    //     env: {
    //         NODE_ENV: "test",
    //         VITE_USE_TINYLICIOUS: "true",
    //         VITE_FORCE_AZURE: "false",
    //         VITE_IS_TEST: "true", // 明示的にテスト環境フラグを設定
    //         // ポートを明示的に設定
    //         VITE_PORT: TEST_PORT,
    //         // TinyliciousのポートをVITE_TINYLICIOUS_PORTとして設定
    //         // global-setup.tsではこの値を取得してPORT環境変数に設定します
    //         VITE_TINYLICIOUS_PORT: TINYLICIOUS_PORT,
    //     },
    //     // ready文字列を指定して、Viteサーバーの準備完了を検知
    //     stdout: "pipe",
    //     stderr: "pipe",
    //     // Viteの "ready in" メッセージを待機
    //     readyCondition: {
    //         pattern: "ready in",
    //         flags: "i",
    //     },
    //     // タイムアウトは開発サーバーが通常起動する時間より少し長めに設定
    //     timeout: 600,
    // },
});
