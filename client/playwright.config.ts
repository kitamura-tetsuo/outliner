import {
    defineConfig,
    devices,
} from "@playwright/test";

// テスト環境の設定
// 環境変数TEST_ENVが'localhost'の場合はlocalhost環境、それ以外はデフォルト環境
// VSCode Playwright拡張から実行する場合は環境変数が正しく渡らないため、直接trueに設定
// 元の設定に戻す場合はこちらのコメントを外してください
// const isLocalhostEnv = process.env.TEST_ENV === 'localhost';
const isLocalhostEnv = true; // localhostを強制的に使用

// テスト用ポートを定義 - これを明示的に指定
const TEST_PORT = isLocalhostEnv ? "7093" : "7080";
// Tinylicious サーバーのポートを定義
const TINYLICIOUS_PORT = isLocalhostEnv ? "7094" : "7082";
// ホストを定義
const VITE_HOST = isLocalhostEnv ? "localhost" : "192.168.50.13";
// 環境設定ファイルを定義
const ENV_FILE = ".env.test";

// console.log(`Using test environment: ${isLocalhostEnv ? "localhost" : "default"}`);
// console.log(`Test port: ${TEST_PORT}, Tinylicious port: ${TINYLICIOUS_PORT}, Host: ${VITE_HOST}`);
// console.log(`Environment file: ${ENV_FILE}`);

export default defineConfig({
    testDir: "./e2e",
    testMatch: "**/*.spec.ts",
    fullyParallel: true,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 2 : 0,
    workers: process.env.CI ? 1 : 4,
    reporter: [["html", { open: "never" }]],
    // テスト実行時のタイムアウト設定を延長
    timeout: 30 * 1000, // 30秒
    expect: {
        // 要素の検出待機のタイムアウト設定を延長
        timeout: 15 * 1000, // 15秒
    },

    // globalSetupとglobalTeardown - require.resolveではなく相対パスを使用
    globalSetup: "./e2e/global-setup.ts",
    globalTeardown: "./e2e/global-teardown.ts",

    use: {
        // Clipboard APIを有効にするためにlocalhostを使用
        baseURL: `http://${VITE_HOST}:${process.env.TEST_PORT || TEST_PORT}`,
        trace: "on-first-retry",
        headless: true,
        // クリップボードへのアクセスを許可
        permissions: ["clipboard-read", "clipboard-write"],
        // ブラウザの起動オプションを設定
        launchOptions: {
            args: ["--allow-file-access-from-files", "--enable-clipboard-read", "--enable-clipboard-write"],
        },
    },

    projects: [
        {
            // コアテスト: 認証不要の基本機能テスト
            name: "core",
            testDir: "./e2e/core",
            use: { ...devices["Desktop Chrome"] },
        },
        {
            // 認証テスト: 本番環境でのみ実行
            name: "auth",
            testDir: "./e2e/auth",
            use: { ...devices["Desktop Chrome"] },
        },
        {
            // ユーティリティテスト: 共通機能のテスト
            name: "utils",
            testDir: "./e2e/utils",
            use: { ...devices["Desktop Chrome"] },
        },
        {
            // 新機能テスト: DB などの追加機能、draft 機能などの検証用
            name: "new",
            testDir: "./e2e/new",
            use: { ...devices["Desktop Chrome"] },
        },
    ],
    // webServer: {
    //     command: `npx dotenv -e .env.test -- npm run dev -- --host 0.0.0.0 --port ${TEST_PORT}`,
    //     url: `http://192.168.50.13:${TEST_PORT}`,
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
