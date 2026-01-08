/**
 * Yjs Test Helpers
 *
 * Test-specific utilities for Yjs synchronization testing.
 * These helpers are designed for E2E tests where immediate data verification is required.
 *
 * ⚠️ WARNING: These utilities are for TEST ENVIRONMENTS ONLY.
 * Do NOT use these patterns in production code.
 *
 * Production code should rely on Y.Doc observe events and reactive UI updates
 * instead of polling for data availability.
 */

import type { Browser, BrowserContext, Page } from "@playwright/test";
import type { WebsocketProvider } from "y-websocket";

/**
 * Wait for both provider.synced and actual data availability in Y.Doc.
 *
 * This function addresses a race condition in y-websocket 2.x where provider.synced
 * can become true before the actual data is available in Y.Doc.
 *
 * ⚠️ TEST ENVIRONMENT ONLY
 * This is a test-specific utility for scenarios where you need to immediately verify
 * data after synchronization. In production code, use Y.Doc observe events instead.
 *
 * @param provider - The WebsocketProvider instance to monitor
 * @param checkDataAvailable - Function that returns true when the expected data is available
 * @param options - Configuration options
 * @param options.timeoutMs - Maximum time to wait in milliseconds (default: 30000)
 * @param options.pollIntervalMs - Polling interval in milliseconds (default: 100)
 * @param options.label - Label for debug logging (default: "yjs-sync")
 * @returns Promise that resolves to true if data is available, false if timeout
 *
 * @example
 * ```typescript
 * // In E2E test
 * const value = await page.evaluate(async () => {
 *     const { waitForSyncedAndDataForTest } = await import("/src/lib/yjs/testHelpers.ts");
 *     const provider = (window as any).__PROVIDER__;
 *     const m = (window as any).__DOC__.getMap("m");
 *
 *     await waitForSyncedAndDataForTest(
 *         provider,
 *         () => m.get("key") !== undefined,
 *         { label: "test-sync" }
 *     );
 *
 *     return m.get("key");
 * });
 * expect(value).toBe("expected-value");
 * ```
 */
export async function waitForSyncedAndDataForTest(
    provider: WebsocketProvider,
    checkDataAvailable: () => boolean,
    options: {
        timeoutMs?: number;
        pollIntervalMs?: number;
        label?: string;
    } = {},
): Promise<boolean> {
    const {
        timeoutMs = 30000,
        pollIntervalMs = 100,
        label = "yjs-sync",
    } = options;

    const maxIterations = Math.floor(timeoutMs / pollIntervalMs);
    const debugEnabled = isConnDebugEnabled();

    // Step 1: Wait for provider.synced
    for (let i = 0; i < maxIterations; i++) {
        if (provider.synced === true) {
            if (debugEnabled) {
                console.log(`[${label}] provider.synced=true after ${i * pollIntervalMs}ms`);
            }
            break;
        }
        await new Promise((r) => setTimeout(r, pollIntervalMs));
    }

    // Step 2: Wait for actual data to be available
    for (let i = 0; i < maxIterations; i++) {
        if (checkDataAvailable()) {
            if (debugEnabled) {
                console.log(`[${label}] data available after ${i * pollIntervalMs}ms from synced`);
            }
            return true;
        }
        await new Promise((r) => setTimeout(r, pollIntervalMs));
    }

    if (debugEnabled) {
        console.log(
            `[${label}] timeout after ${timeoutMs}ms, synced=${provider.synced}, dataAvailable=${checkDataAvailable()}`,
        );
    }
    return false;
}

/**
 * Check if connection debugging is enabled.
 * This is used to control verbose logging in test environments.
 */
function isConnDebugEnabled(): boolean {
    if (typeof window !== "undefined") {
        return localStorage.getItem("VITE_YJS_CONN_DEBUG") === "true";
    }
    return false;
}

/**
 * Configuration options for browser page initialization.
 */
export interface BrowserPageOptions {
    /** Enable authentication requirement */
    requireAuth?: boolean;
    /** Disable IndexedDB persistence */
    disableIndexedDB?: boolean;
    /** Console log prefix for debugging */
    consolePrefix?: string;
}

/**
 * Initialize a browser page with common test settings.
 *
 * ⚠️ TEST ENVIRONMENT ONLY
 * This helper sets up localStorage flags and authentication for Yjs testing.
 *
 * @param browser - Playwright Browser instance
 * @param options - Configuration options
 * @returns Object containing context and page
 *
 * @example
 * ```typescript
 * const { context, page } = await initializeBrowserPage(browser, {
 *     enableWebSocket: true,
 *     requireAuth: true,
 *     consolePrefix: "p1"
 * });
 * ```
 */
export async function initializeBrowserPage(
    browser: Browser,
    options: BrowserPageOptions = {},
): Promise<{ context: BrowserContext; page: Page; }> {
    const {
        requireAuth = true,
        disableIndexedDB = true,
        consolePrefix = "page",
    } = options;

    const context = await browser.newContext();
    const page = await context.newPage();

    // Set up console logging
    page.on("console", (m) => console.log(`[${consolePrefix} console]`, m.text().slice(0, 100)));

    // Set up localStorage flags
    await page.addInitScript(
        ({ requireAuth, disableIDB }) => {
            localStorage.setItem("VITE_IS_TEST", "true");
            localStorage.setItem("VITE_E2E_TEST", "true"); // Additional flag for robust detection
            localStorage.setItem("VITE_YJS_ENABLE_WS", "true");
            // Force-enable WS in tests even if env disables it
            localStorage.setItem("VITE_YJS_FORCE_WS", "true");
            if (disableIDB) {
                localStorage.setItem("VITE_DISABLE_YJS_INDEXEDDB", "true");
            }
            if (requireAuth) {
                localStorage.setItem("VITE_YJS_REQUIRE_AUTH", "true");
            }
        },
        {
            requireAuth,
            disableIDB: disableIndexedDB,
        },
    );

    // Navigate to the app
    await page.goto("http://localhost:7090/", {
        waitUntil: "domcontentloaded",
    });

    // Wait for UserManager to be available
    await page.waitForFunction(
        () => !!(window as any).__USER_MANAGER__,
        null,
        { timeout: 10000 },
    );

    // Authenticate if required
    if (requireAuth) {
        await page.evaluate(async () => {
            const mgr = (window as any).__USER_MANAGER__;
            await mgr?.loginWithEmailPassword?.(
                "test@example.com",
                "password",
            );
        });

        // Wait for authentication to complete
        await page.waitForFunction(
            () => !!(window as any).__USER_MANAGER__?.getCurrentUser?.(),
            null,
            { timeout: 10000 },
        );
    }

    return { context, page };
}

/**
 * Create a minimal Yjs connection for testing.
 *
 * ⚠️ TEST ENVIRONMENT ONLY
 * This helper creates a minimal Y.Doc and WebSocket provider connection
 * for low-level Yjs synchronization testing.
 *
 * @param page - Playwright Page instance
 * @param projectId - Project/container ID
 * @param options - Configuration options
 * @returns True if connection was successful
 *
 * @example
 * ```typescript
 * const connected = await createMinimalYjsConnection(page, projectId, {
 *     docVar: "__DOC__",
 *     providerVar: "__PROVIDER__"
 * });
 * expect(connected).toBeTruthy();
 * ```
 */
export async function createMinimalYjsConnection(
    page: Page,
    projectId: string,
    options: {
        docVar?: string;
        providerVar?: string;
        enableLogging?: boolean;
    } = {},
): Promise<boolean> {
    const {
        docVar = "__DOC__",
        providerVar = "__PROVIDER__",
        enableLogging = true,
    } = options;

    // Use string concatenation to avoid TypeScript checking the import path
    const importPath = "/src/lib/yjs/" + "connection.ts";
    return await page.evaluate(
        async ({ pid, docVar, providerVar, enableLogging, importPath }) => {
            const { createMinimalProjectConnection } = await import(
                importPath as any
            );
            const conn = await createMinimalProjectConnection(pid);
            (window as any)[docVar] = conn.doc;
            const provider = conn.provider as any;
            (window as any)[providerVar] = provider;

            if (enableLogging) {
                provider.on("status", (e: any) => console.log(`[${providerVar}] status`, e.status));
                provider.on("sync", (isSynced: boolean) => console.log(`[${providerVar}] sync`, isSynced));
                console.log(
                    `[${providerVar}] init wsconnected=`,
                    provider.wsconnected,
                    "synced=",
                    provider.synced,
                    "url=",
                    provider.url,
                );
            }
            try {
                // Explicitly attempt connection to avoid lazy state
                provider.connect?.();
            } catch {}

            return true;
        },
        { pid: projectId, docVar, providerVar, enableLogging, importPath },
    );
}

/**
 * Set up update event tracking on a Y.Doc.
 *
 * ⚠️ TEST ENVIRONMENT ONLY
 * This helper sets up counters for Y.Doc update events for debugging.
 *
 * @param page - Playwright Page instance
 * @param options - Configuration options
 *
 * @example
 * ```typescript
 * await setupUpdateTracking(page, {
 *     docVar: "__DOC2__",
 *     counterVar: "__UPDATES2__"
 * });
 * const updateCount = await page.evaluate(() => (window as any).__UPDATES2__);
 * ```
 */
export async function setupUpdateTracking(
    page: Page,
    options: {
        docVar?: string;
        counterVar?: string;
        counterV2Var?: string;
    } = {},
): Promise<void> {
    const {
        docVar = "__DOC__",
        counterVar = "__UPDATES__",
        counterV2Var = "__UPDATES_V2__",
    } = options;

    await page.evaluate(
        ({ docVar, counterVar, counterV2Var }) => {
            const doc = (window as any)[docVar];
            if (!doc) {
                console.error(`setupUpdateTracking: ${docVar} not found`);
                return;
            }

            (window as any)[counterVar] = 0;
            (window as any)[counterV2Var] = 0;

            doc.on("update", () => {
                (window as any)[counterVar]++;
            });

            doc.on("updateV2", () => {
                (window as any)[counterV2Var]++;
            });
        },
        { docVar, counterVar, counterV2Var },
    );
}

/**
 * Result type for prepareTwoBrowserPages function.
 */
export interface TwoBrowserPagesResult {
    context1: BrowserContext;
    page1: Page;
    context2: BrowserContext;
    page2: Page;
    projectId: string;
}

/**
 * Prepare two browser pages for Yjs synchronization testing.
 *
 * ⚠️ TEST ENVIRONMENT ONLY
 * This helper creates two browser contexts with minimal Yjs connections
 * for testing synchronization between multiple clients.
 *
 * @param browser - Playwright Browser instance
 * @param options - Configuration options
 * @returns Object containing both contexts, pages, and project ID
 *
 * @example
 * ```typescript
 * const { page1, page2, context1, context2, projectId } =
 *     await prepareTwoBrowserPages(browser, {
 *         page1Prefix: "p1",
 *         page2Prefix: "p2"
 *     });
 *
 * // Use page1 and page2 for testing
 * await page1.evaluate(() => {
 *     const doc = (window as any).__DOC__;
 *     doc.getMap("m").set("key", "value");
 * });
 *
 * // Clean up
 * await context1.close();
 * await context2.close();
 * ```
 */
export async function prepareTwoBrowserPages(
    browser: Browser,
    options: {
        projectId?: string;
        page1Prefix?: string;
        page2Prefix?: string;
        page1DocVar?: string;
        page1ProviderVar?: string;
        page2DocVar?: string;
        page2ProviderVar?: string;
    } = {},
): Promise<TwoBrowserPagesResult> {
    const {
        projectId = `p${Date.now().toString(16)}`,
        page1Prefix = "p1",
        page2Prefix = "p2",
        page1DocVar = "__DOC__",
        page1ProviderVar = "__PROVIDER__",
        page2DocVar = "__DOC2__",
        page2ProviderVar = "__PROVIDER2__",
    } = options;

    // Initialize first page
    const { context: context1, page: page1 } = await initializeBrowserPage(
        browser,
        {
            requireAuth: true,
            consolePrefix: page1Prefix,
        },
    );

    // Create minimal Yjs connection for page1
    const page1Connected = await createMinimalYjsConnection(
        page1,
        projectId,
        {
            docVar: page1DocVar,
            providerVar: page1ProviderVar,
        },
    );

    if (!page1Connected) {
        throw new Error(`${page1Prefix} failed to connect`);
    }

    // Initialize second page
    const { context: context2, page: page2 } = await initializeBrowserPage(
        browser,
        {
            requireAuth: true,
            consolePrefix: page2Prefix,
        },
    );

    // Create minimal Yjs connection for page2
    const page2Connected = await createMinimalYjsConnection(
        page2,
        projectId,
        {
            docVar: page2DocVar,
            providerVar: page2ProviderVar,
        },
    );

    if (!page2Connected) {
        throw new Error(`${page2Prefix} failed to connect`);
    }

    return {
        context1,
        page1,
        context2,
        page2,
        projectId,
    };
}

/**
 * Result type for prepareTwoFullBrowserPages function.
 */
export interface TwoFullBrowserPagesResult {
    context1: BrowserContext;
    page1: Page;
    context2: BrowserContext;
    page2: Page;
    projectName: string;
    pageName: string;
}

/**
 * Prepare two browser pages with full test environment (project, page, items).
 *
 * ⚠️ TEST ENVIRONMENT ONLY
 * This helper creates two browser contexts with full test environment setup
 * using TestHelpers.prepareTestEnvironment for testing collaboration features.
 *
 * Note: This function requires TestHelpers from e2e/utils/testHelpers.ts.
 * It should only be used in E2E test files, not in this library file directly.
 *
 * @param browser - Playwright Browser instance
 * @param testInfo - Playwright TestInfo object
 * @param initialItems - Initial items to create
 * @param TestHelpers - TestHelpers class from e2e/utils/testHelpers.ts
 * @returns Object containing both contexts, pages, and test environment info
 *
 * @example
 * ```typescript
 * // In E2E test file:
 * import { TestHelpers } from "../utils/testHelpers";
 * const { page1, page2, context1, context2, projectName, pageName } =
 *     await prepareTwoFullBrowserPages(browser, testInfo, ["Test Item 1"], TestHelpers);
 * ```
 */
export async function prepareTwoFullBrowserPages(
    browser: Browser,
    testInfo: any,
    initialItems: string[],
    TestHelpers: any,
): Promise<TwoFullBrowserPagesResult> {
    // Create first browser context
    const context1 = await browser.newContext();
    const page1 = await context1.newPage();

    // Set up console logging for page1
    page1.on("console", (msg) => {
        console.log(`[page1 console.${msg.type()}]`, msg.text().slice(0, 100));
    });

    // Ensure WS is forced for Yjs E2E on page1 (TestHelpers defaults to WS disabled)
    await page1.addInitScript(() => {
        try {
            localStorage.setItem("VITE_YJS_FORCE_WS", "true");
        } catch {}
    });

    // Prepare test environment for page1
    const { projectName, pageName } = await TestHelpers.prepareTestEnvironment(
        page1,
        testInfo,
        initialItems,
    );

    // Get the page URL from page1
    const pageUrl = page1.url();
    console.log(`Page1 URL: ${pageUrl}`);

    // Wait for page1 to initialize Yjs client and project
    await page1.waitForFunction(
        () => {
            const yjsStore = (window as any).__YJS_STORE__;
            const client = yjsStore?.yjsClient;
            if (!client) {
                console.log("page1: yjsClient not found");
                return false;
            }
            const project = client.getProject?.();
            if (!project) {
                console.log("page1: project not found");
                return false;
            }
            const items = project.items as any;
            const pageCount = items?.length ?? 0;
            console.log(`page1: Yjs client initialized, pageCount=${pageCount}`);
            return !!(project && items);
        },
        { timeout: 15000 },
    );

    console.log("Page1 Yjs client initialized");

    // Create second browser context
    const context2 = await browser.newContext();
    const page2 = await context2.newPage();

    // Set up console logging for page2
    page2.on("console", (msg) => {
        console.log(`[page2 console.${msg.type()}]`, msg.text().slice(0, 100));
    });

    // Enable WebSocket and test flags for page2
    await page2.addInitScript(() => {
        localStorage.setItem("VITE_IS_TEST", "true");
        localStorage.setItem("VITE_E2E_TEST", "true"); // Additional flag for robust detection
        localStorage.setItem("VITE_USE_FIREBASE_EMULATOR", "true");
        localStorage.setItem("SKIP_TEST_CONTAINER_SEED", "true");
        localStorage.setItem("VITE_YJS_ENABLE_WS", "true");
        localStorage.setItem("VITE_YJS_FORCE_WS", "true");
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (window as any).__E2E__ = true;
    });

    // Navigate page2 to the same URL as page1
    await page2.goto(pageUrl, { waitUntil: "domcontentloaded" });

    // Authenticate page2
    await page2.waitForFunction(
        () => {
            return !!(window as any).__USER_MANAGER__;
        },
        { timeout: 10000 },
    );

    await page2.evaluate(async () => {
        const mgr = (window as any).__USER_MANAGER__;
        if (mgr?.loginWithEmailPassword) {
            await mgr.loginWithEmailPassword("test@example.com", "password");
        }
    });

    // Wait for page2 authentication to complete
    await page2.waitForFunction(
        () => {
            const mgr = (window as any).__USER_MANAGER__;
            return !!(mgr && mgr.getCurrentUser && mgr.getCurrentUser());
        },
        { timeout: 10000 },
    );

    // Wait for page2 to initialize Yjs client and appStore
    await page2.waitForFunction(
        () => {
            const yjsStore = (window as any).__YJS_STORE__;
            const client = yjsStore?.yjsClient;
            if (!client) {
                console.log("page2: yjsClient not found");
                return false;
            }
            const project = client.getProject?.();
            if (!project || !project.items) {
                console.log("page2: project or items not found");
                return false;
            }
            const appStore = (window as any).appStore;
            if (!appStore) {
                console.log("page2: appStore not found");
                return false;
            }
            console.log("page2: Yjs client and appStore initialized");
            return true;
        },
        { timeout: 15000 },
    );

    console.log("Page2 Yjs client and appStore initialized");

    return {
        context1,
        page1,
        context2,
        page2,
        projectName,
        pageName,
    };
}
