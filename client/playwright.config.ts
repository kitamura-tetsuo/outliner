// Do not add webServer.

import { defineConfig, devices } from "@playwright/test";
import path from "path";
import { fileURLToPath } from "url";

// ESモジュールで__dirnameを使うための設定
const __filename = fileURLToPath(import.meta.url);
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const __dirname = path.dirname(__filename);

// -- 単一 spec 実行かどうかを推定 -------------------------
function detectSingleSpec() {
    // 環境変数が既に設定されている場合はそれを使用
    if (process.env.PLAYWRIGHT_SINGLE_SPEC_RUN !== undefined) {
        return process.env.PLAYWRIGHT_SINGLE_SPEC_RUN === "true";
    }

    const idx = process.argv.findIndex(a => a === "test");
    const patterns = idx === -1 ? [] : process.argv.slice(idx + 1).filter(a => !a.startsWith("-"));
    const isSingle = patterns.length === 1;

    // 環境変数に設定してワーカープロセスに伝達
    process.env.PLAYWRIGHT_SINGLE_SPEC_RUN = isSingle.toString();

    return isSingle;
}

export const isSingleSpecRun = detectSingleSpec();

// テスト環境の設定
// 環境変数TEST_ENVが'localhost'の場合はlocalhost環境、それ以外はデフォルト環境
// VSCode Playwright拡張から実行する場合は環境変数が正しく渡らないことがあるため、
// 必要に応じて直接trueに設定してください
const isLocalhostEnv = process.env.TEST_ENV === "localhost" || true; // デフォルトでlocalhostを使用

// テスト用ポートを定義 - これを明示的に指定
const TEST_PORT = isLocalhostEnv ? "7090" : "7080";
// Tinylicious サーバーのポートを定義
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const TINYLICIOUS_PORT = isLocalhostEnv ? "7092" : "7082";
// ホストを定義
const VITE_HOST = process.env.VITE_HOST || "localhost";
// 環境設定ファイルを定義
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const ENV_FILE = isLocalhostEnv ? ".env.localhost.test" : ".env.test";

const commonArgs = [
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
];

// 👉 add the debugging port **only** in single-spec mode
// debug from vscode
const workerIdx = Number(process.env.TEST_WORKER_INDEX ?? 0); // undefined → 0
const debugArgs = isSingleSpecRun
    ? [`--remote-debugging-port=${process.env.CDP_PORT ?? 9222 + workerIdx}`]
    : [];

// console.log(`workerIdx: ${workerIdx}`);
// console.log(`Using test environment: ${isLocalhostEnv ? "localhost" : "default"}`);
// console.log(`Test port: ${TEST_PORT}, Tinylicious port: ${TINYLICIOUS_PORT}, Host: ${VITE_HOST}`);
// console.log(`Environment file: ${ENV_FILE}`);
export default defineConfig({
    testDir: "./e2e",
    testMatch: "**/*.spec.ts",
    fullyParallel: false,
    forbidOnly: !!process.env.CI,
    retries: (process.env.CI || !isSingleSpecRun) ? 2 : 0,
    workers: process.env.CI ? 4 : 4,
    maxFailures: process.env.DISABLE_MAX_FAILURES ? undefined : process.env.CI ? 1 : 1,

    reporter: [
        ["html", { open: "never" }],
        // E2Eカバレッジレポートは scripts/generate-e2e-coverage.js で生成されます
    ],
    // テスト実行時のタイムアウトを延長（環境初期化の揺らぎに対応）
    timeout: 30 * 1000, // 30秒
    expect: {
        // 要素の検出待機のタイムアウト設定を延長
        timeout: 30 * 1000, // 30秒
    },

    use: {
        headless: true,
        ...devices["Desktop Chrome"],
        // Chromium用のタイムアウト設定を延長
        launchOptions: {
            // 共有メモリの問題を回避するためのオプション
            args: [...commonArgs, ...debugArgs],
        },
        // Clipboard APIを有効にするためにlocalhostを使用
        baseURL: `http://${VITE_HOST}:${process.env.TEST_PORT || TEST_PORT}`,
        trace: "on-first-retry",
        // クリップボードへのアクセスを許可
        permissions: ["clipboard-read", "clipboard-write"],
    },

    projects: ((baseProjects) => {
        if (!process.env.CI) {
            baseProjects.push({
                name: "debug",
                testDir: "./e2e/debug",
            });
        }
        return baseProjects;
    })([
        {
            name: "basic",
            testDir: "./e2e/basic",
        },
        {
            name: "core",
            testDir: "./e2e/core",
        },
        {
            name: "new",
            testDir: "./e2e/new",
        },
        {
            name: "auth",
            testDir: "./e2e/auth",
        },
        {
            name: "utils",
            testDir: "./e2e/utils",
        },
        {
            name: "server",
            testDir: "./e2e/server",
        },
        {
            name: "yjs",
            testDir: "./e2e/yjs",
        },
    ]),
});
