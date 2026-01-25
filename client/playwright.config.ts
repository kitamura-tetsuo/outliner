// Do not add webServer.

import { defineConfig, devices } from "@playwright/test";
import path from "path";
import { fileURLToPath } from "url";

// Setup for using __dirname in ES modules
const __filename = fileURLToPath(import.meta.url);
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const __dirname = path.dirname(__filename);

// -- Estimate if running a single spec -------------------------
function detectSingleSpec() {
    // Use environment variable if already set
    if (process.env.PLAYWRIGHT_SINGLE_SPEC_RUN !== undefined) {
        return process.env.PLAYWRIGHT_SINGLE_SPEC_RUN === "true";
    }

    const idx = process.argv.findIndex(a => a === "test");
    const patterns = idx === -1 ? [] : process.argv.slice(idx + 1).filter(a => !a.startsWith("-"));
    const isSingle = patterns.length === 1;

    // Set to environment variable to pass to worker process
    process.env.PLAYWRIGHT_SINGLE_SPEC_RUN = isSingle.toString();

    return isSingle;
}

export const isSingleSpecRun = detectSingleSpec();

// Test Environment Configuration
// Use localhost environment if TEST_ENV is 'localhost', otherwise default environment
// Environment variables may not be passed correctly when running from VSCode Playwright extension,
// so set to true directly if necessary
const isLocalhostEnv = process.env.TEST_ENV === "localhost" || true; // Use localhost by default

// Define test port - Specify this explicitly
// Define Tinylicious server port
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const TINYLICIOUS_PORT = isLocalhostEnv ? "7092" : "7082";
// Define host
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
    // Explicitly specify shared memory size
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
    // Extend timeout for test execution (handling environmental initialization fluctuations)
    // Extended to 120s as connection to Hocuspocus and Yjs sync may take time
    timeout: 120 * 1000,
    expect: {
        // Extend timeout setting for element detection wait
        timeout: 90 * 1000,
    },

    use: {
        headless: true,
        ...devices["Desktop Chrome"],
        // Extend timeout setting for Chromium
        launchOptions: {
            // Option to avoid shared memory issues
            args: [...commonArgs, ...debugArgs],
        },
        // Use localhost to enable Clipboard API
        baseURL: `http://${VITE_HOST}:${process.env.TEST_PORT || TEST_PORT}`,
        // Allow access to clipboard
        permissions: ["clipboard-read", "clipboard-write"],
    },

    projects: [
        {
            // Basic tests: For environment check and minimal configuration verification
            name: "basic",
            testDir: "./e2e/basic",
        },
        {
            // Core tests 1: a-c (excl clm), f
            name: "core-1",
            testDir: "./e2e/core",
            testMatch: ["[abcf]*.spec.ts"],
            testIgnore: ["**/clm*.spec.ts"],
        },
        {
            // Core tests 2: clm only
            name: "core-2",
            testDir: "./e2e/core",
            testMatch: ["**/clm*.spec.ts"],
        },
        {
            // Core tests 3: l only
            name: "core-3",
            testDir: "./e2e/core",
            testMatch: ["**/l*.spec.ts"],
        },
        {
            // Core tests 4: slr only
            name: "core-4",
            testDir: "./e2e/core",
            testMatch: ["**/slr*.spec.ts"],
        },
        {
            // Core tests 5: n, o, p
            name: "core-5",
            testDir: "./e2e/core",
            testMatch: ["**/[nop]*.spec.ts"],
        },
        {
            // Core tests 6: sbd, sch
            name: "core-6",
            testDir: "./e2e/core",
            testMatch: ["**/sbd*.spec.ts", "**/sch*.spec.ts"],
        },
        {
            // Core tests 7: sea, sec, server, snapshot
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
            // Core tests 8: d, e, g, h, i, j, k, m, q, t, u, v, w, x, y, z, M
            name: "core-8",
            testDir: "./e2e/core",
            testMatch: ["**/[deghijkmtuvwxyzM]*.spec.ts"],
        },
        {
            // New feature tests 1: a, b
            name: "new-1",
            testDir: "./e2e/new",
            testMatch: ["**/[ab]*.spec.ts"],
        },
        {
            // New feature tests 2: c
            name: "new-2",
            testDir: "./e2e/new",
            testMatch: ["**/c*.spec.ts"],
        },
        {
            // New feature tests 3: d, e, f, g, h, i
            name: "new-3",
            testDir: "./e2e/new",
            testMatch: ["**/[defghi]*.spec.ts"],
        },
        {
            // New feature tests 4: j-z
            name: "new-4",
            testDir: "./e2e/new",
            testMatch: ["**/[j-z]*.spec.ts"],
        },
        {
            // Auth tests: Run only in production environment
            name: "auth",
            testDir: "./e2e/auth",
        },
        {
            // Utility tests: Testing common functions
            name: "utils",
            testDir: "./e2e/utils",
        },
        {
            // Server tests: For verifying backend connection
            name: "server",
            testDir: "./e2e/server",
        },
        {
            // Yjs tests: Testing Yjs synchronization function
            name: "yjs",
            testDir: "./e2e/yjs",
        },
    ],
});
