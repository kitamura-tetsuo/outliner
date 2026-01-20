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
// Tinylicious サーバーのポートを定義
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const TINYLICIOUS_PORT = isLocalhostEnv ? "7092" : "7082";
// ホストを定義
const VITE_HOST = process.env.VITE_HOST || "localhost";
const TEST_PORT = 7090;

// Force the same project ID as the emulator
process.env.VITE_FIREBASE_PROJECT_ID = "outliner-d57b0";
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
    retries: (process.env.CI || !isSingleSpecRun) ? 2 : 1,
    workers: 4,
    maxFailures: process.env.CI ? 3 : 5,

    reporter: [
        ["html", { open: "never" }],
        ["list"],
        ...(process.env.PLAYWRIGHT_JSON_OUTPUT_NAME
            ? [["json", { outputFile: process.env.PLAYWRIGHT_JSON_OUTPUT_NAME }]]
            : []),
    ] as any,
    // テスト実行時のタイムアウトを延長（環境初期化の揺らぎに対応）
    // Hocuspocusへの接続とYjs同期に時間がかかることがあるため、120秒に延長
    timeout: 120 * 1000,
    expect: {
        // 要素の検出待機のタイムアウト設定を延長
        timeout: 90 * 1000,
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
            // コアテスト1: a-c (excl clm), f
            name: "core-1",
            testDir: "./e2e/core",
            testMatch: ["[abcf]*.spec.ts"],
            testIgnore: ["**/clm*.spec.ts"],
        },
        {
            // コアテスト2: clm only
            name: "core-2",
            testDir: "./e2e/core",
            testMatch: ["**/clm*.spec.ts"],
        },
        {
            // コアテスト3: l only
            name: "core-3",
            testDir: "./e2e/core",
            testMatch: ["**/l*.spec.ts"],
        },
        {
            // コアテスト4: slr only
            name: "core-4",
            testDir: "./e2e/core",
            testMatch: ["**/slr*.spec.ts"],
        },
        {
            // コアテスト5: n, o, p
            name: "core-5",
            testDir: "./e2e/core",
            testMatch: ["**/[nop]*.spec.ts"],
        },
        {
            // コアテスト6: sbd, sch
            name: "core-6",
            testDir: "./e2e/core",
            testMatch: ["**/sbd*.spec.ts", "**/sch*.spec.ts"],
        },
        {
            // コアテスト7: sea, sec, server, snapshot
            name: "core-7",
            testDir: "./e2e/core",
            testMatch: [
                "**/sea*.spec.ts",
                "**/sec*.spec.ts",
                "**/seed*.spec.ts",
                "**/server*.spec.ts",
                "**/snapshot*.spec.ts",
            ],
        },
        {
            // コアテスト8: d, e, g, h, i, j, k, m, q, t, u, v, w, x, y, z, M
            name: "core-8",
            testDir: "./e2e/core",
            testMatch: ["**/[deghijkmtuvwxyzM]*.spec.ts"],
        },
        {
            // 新機能テスト1: a, b
            name: "new-1",
            testDir: "./e2e/new",
            testMatch: ["**/[ab]*.spec.ts"],
        },
        {
            // 新機能テスト2: c
            name: "new-2",
            testDir: "./e2e/new",
            testMatch: ["**/c*.spec.ts"],
        },
        {
            // 新機能テスト3: d, e, f, g, h, i
            name: "new-3",
            testDir: "./e2e/new",
            testMatch: ["**/[defghi]*.spec.ts"],
        },
        {
            // 新機能テスト4: j-z
            name: "new-4",
            testDir: "./e2e/new",
            testMatch: ["**/[j-z]*.spec.ts"],
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
        {
            // サーバーテスト: バックエンド接続の検証用
            name: "server",
            testDir: "./e2e/server",
        },
        {
            // Yjsテスト: Yjs同期機能のテスト
            name: "yjs",
            testDir: "./e2e/yjs",
        },
    ],
});
