// Do not add webServer.

import { defineConfig, devices } from "@playwright/test";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// Configuration to use __dirname in ES modules
const __filename = fileURLToPath(import.meta.url);

const __dirname = path.dirname(__filename);

// Chromium executable to launch.
//
// Undefined (the normal case) lets Playwright use the browser it downloaded
// itself. Sandboxed environments that cannot reach the browser CDN keep a
// pre-installed Chromium instead; scripts/setup.sh records its path in
// .playwright-chromium-path at the repository root, and
// PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH overrides both.
function resolveChromiumExecutable(): string | undefined {
    const fromEnv = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
    if (fromEnv && fs.existsSync(fromEnv)) {
        return fromEnv;
    }

    const marker = path.resolve(__dirname, "..", ".playwright-chromium-path");
    if (fs.existsSync(marker)) {
        const recorded = fs.readFileSync(marker, "utf8").trim();
        if (recorded && fs.existsSync(recorded)) {
            return recorded;
        }
    }

    return undefined;
}

const chromiumExecutablePath = resolveChromiumExecutable();

// -- Estimate whether it is a single spec run -------------------------
function detectSingleSpec() {
    // Use environment variable if already set
    if (process.env.PLAYWRIGHT_SINGLE_SPEC_RUN !== undefined) {
        return process.env.PLAYWRIGHT_SINGLE_SPEC_RUN === "true";
    }

    const idx = process.argv.findIndex(a => a === "test");
    const patterns = idx === -1 ? [] : process.argv.slice(idx + 1).filter(a => !a.startsWith("-"));
    const isSingle = patterns.length === 1;

    // Set to environment variable to propagate to worker processes
    process.env.PLAYWRIGHT_SINGLE_SPEC_RUN = isSingle.toString();

    return isSingle;
}

export const isSingleSpecRun = detectSingleSpec();

// Test environment configuration
// Use localhost environment if TEST_ENV is 'localhost', otherwise use default environment
// Since environment variables may not be passed correctly when running from VSCode Playwright extension,
// set to true directly if necessary
const isLocalhostEnv = process.env.TEST_ENV === "localhost" || true; // Default to localhost

// Define test port - specify explicitly
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
    ] as import("@playwright/test").ReporterDescription[],
    // Extend test execution timeout (to accommodate environment initialization fluctuations)
    // Extended to 120 seconds because connection to Hocuspocus and Yjs synchronization may take time
    timeout: 120 * 1000,
    expect: {
        // Extend element detection timeout
        timeout: 90 * 1000,
    },

    use: {
        headless: true,
        ...devices["Desktop Chrome"],
        // Extend timeout setting for Chromium
        launchOptions: {
            // Option to avoid shared memory issues
            args: [...commonArgs, ...debugArgs],
            ...(chromiumExecutablePath ? { executablePath: chromiumExecutablePath } : {}),
        },
        // Use localhost to enable Clipboard API
        baseURL: `http://${VITE_HOST}:${process.env.TEST_PORT || TEST_PORT}`,
        // Allow clipboard access
        permissions: ["clipboard-read", "clipboard-write"],
    },

    projects: [
        {
            // Tables tests
            name: "tables",
            testDir: "./e2e/tables",
        },
        {
            name: "deployed",
            use: {
                ...devices["Desktop Chrome"],
                baseURL: process.env.PLAYWRIGHT_BASE_URL || "http://localhost:7080",
            },
            testMatch: "**/deployed/**/*.spec.ts",
            retries: 0,
        },

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
            // Core tests 4: slr a-p. Split from the rest of slr (core-4b) because the
            // full slr* group (31 files) run sequentially in one worker was long enough
            // to make the CI runner's browser tab stall under resource pressure near the
            // end of the run (observed as a ~2 minute hang with no console output).
            name: "core-4",
            testDir: "./e2e/core",
            testMatch: ["**/slr-[a-p]*.spec.ts"],
        },
        {
            // Core tests 4b: slr q-z (see core-4 above)
            name: "core-4b",
            testDir: "./e2e/core",
            testMatch: ["**/slr-[q-z]*.spec.ts"],
        },
        {
            // Core tests 5: n, o, p
            name: "core-5",
            testDir: "./e2e/core",
            testMatch: ["**/[nop]*.spec.ts"],
        },
        {
            // Core tests 6: sbd, sch, srg
            name: "core-6",
            testDir: "./e2e/core",
            testMatch: ["**/sbd*.spec.ts", "**/sch*.spec.ts", "**/srg*.spec.ts"],
        },
        {
            name: "schedule",
            testDir: "./e2e/schedule",
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
            // New feature tests 4: j-s
            name: "new-4",
            testDir: "./e2e/new",
            testMatch: ["**/[j-s]*.spec.ts"],
        },
        {
            // New feature tests 5: t-z
            name: "new-5",
            testDir: "./e2e/new",
            testMatch: ["**/[t-z]*.spec.ts"],
        },
        {
            // Auth tests: Run only in production environment
            name: "auth",
            testDir: "./e2e/auth",
        },
        {
            // Utility tests: Common functionality tests
            name: "utils",
            testDir: "./e2e/utils",
        },
        {
            // Server tests: For backend connection verification
            name: "server",
            testDir: "./e2e/server",
        },
        {
            // Yjs tests: Yjs synchronization functionality tests
            name: "yjs",
            testDir: "./e2e/yjs",
        },
        {
            // Environment maintenance tests that need a browser (ENV-*)
            name: "env",
            testDir: "./e2e/env",
        },
    ],
});
