import { HocuspocusProvider } from "@hocuspocus/provider";
import { type TestInfo } from "@playwright/test";
import type { Browser, BrowserContext, Page } from "@playwright/test";

export async function waitForSyncedAndDataForTest(
    provider: HocuspocusProvider,
    checkDataAvailable: () => boolean,
    options: { timeoutMs?: number; pollIntervalMs?: number; label?: string; } = {},
): Promise<boolean> {
    const { timeoutMs = 30000, pollIntervalMs = 100 } = options;
    const maxIterations = Math.floor(timeoutMs / pollIntervalMs);
    for (let i = 0; i < maxIterations; i++) {
        if (provider.isSynced === true) break;
        await new Promise((r) => setTimeout(r, pollIntervalMs));
    }
    for (let i = 0; i < maxIterations; i++) {
        if (checkDataAvailable()) return true;
        await new Promise((r) => setTimeout(r, pollIntervalMs));
    }
    return false;
}

export async function initializeBrowserPage(
    browser: Browser,
    options: { requireAuth?: boolean; disableIndexedDB?: boolean; consolePrefix?: string; } = {},
): Promise<{ context: BrowserContext; page: Page; }> {
    const { requireAuth = true, disableIndexedDB = true, consolePrefix = "page" } = options;
    const context = await browser.newContext();
    const page = await context.newPage();

    // Set up console logging
    page.on("console", (m) => console.log(`[${consolePrefix} console]`, m.text().slice(0, 100)));

    await page.addInitScript(({ requireAuth, disableIDB }) => {
        localStorage.setItem("VITE_IS_TEST", "true");
        if (disableIDB) localStorage.setItem("VITE_DISABLE_YJS_INDEXEDDB", "true");
        if (requireAuth) localStorage.setItem("VITE_YJS_REQUIRE_AUTH", "true");
    }, { requireAuth, disableIDB: disableIndexedDB });
    await page.goto("http://127.0.0.1:7090/", { waitUntil: "domcontentloaded" });

    // Authenticate if required
    if (requireAuth) {
        await page.evaluate(async () => {
            const win = window as unknown as Record<
                string,
                { loginWithEmailPassword?: (e: string, p: string) => Promise<void>; }
            >;
            const mgr = win.__USER_MANAGER__;
            if (mgr?.loginWithEmailPassword) {
                await mgr.loginWithEmailPassword("test@example.com", "password");
            }
        });

        // Wait for authentication to complete
        await page.waitForFunction(
            () => {
                const win = window as unknown as Record<string, { getCurrentUser?: () => unknown; }>;
                const mgr = win.__USER_MANAGER__;
                return !!(mgr && mgr.getCurrentUser && mgr.getCurrentUser());
            },
            null,
            { timeout: 10000 },
        );
    }

    return { context, page };
}

export async function reconnectProvider(page: Page, providerVar: string = "__PROVIDER__"): Promise<void> {
    await page.evaluate(async ({ pv }) => {
        const win = window as unknown as Record<string, unknown>;
        const provider = win[pv] as { disconnect: () => void; connect: () => Promise<void>; };
        if (!provider) return;

        try {
            provider.disconnect();
            await new Promise(r => setTimeout(r, 100));
            await provider.connect();
        } catch {}
    }, { pv: providerVar });
}

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

    const importPath = "/src/lib/yjs/" + "connection.ts";
    return await page.evaluate(
        async ({ pid, docVar, providerVar, enableLogging, importPath }) => {
            const { createMinimalProjectConnection } = await import(
                importPath as string
            );
            const conn = await createMinimalProjectConnection(pid);
            const win = window as unknown as Record<string, unknown>;
            win[docVar] = conn.doc;
            const provider = conn.provider as HocuspocusProvider;
            win[providerVar] = provider;

            if (enableLogging) {
                provider.on("status", (e: { status: string; }) => console.log(`[${providerVar}] status`, e.status));
                provider.on("sync", (isSynced: boolean) => console.log(`[${providerVar}] sync`, isSynced));
            }
            try {
                await provider.connect();
            } catch {}

            return true;
        },
        { pid: projectId, docVar, providerVar, enableLogging, importPath },
    );
}

export async function setupUpdateTracking(
    page: Page,
    options: { docVar?: string; counterVar?: string; counterV2Var?: string; } = {},
): Promise<void> {
    const { docVar = "__DOC__", counterVar = "__UPDATES__", counterV2Var = "__UPDATES_V2__" } = options;
    await page.evaluate(({ docVar, counterVar, counterV2Var }) => {
        const win = window as unknown as Record<string, unknown>;
        const doc = win[docVar] as { on: (name: string, cb: () => void) => void; } | undefined;
        if (!doc) return;
        const counters = win as unknown as Record<string, number>;
        counters[counterVar] = 0;
        counters[counterV2Var] = 0;
        doc.on("update", () => {
            counters[counterVar]++;
        });
        doc.on("updateV2", () => {
            counters[counterV2Var]++;
        });
    }, { docVar, counterVar, counterV2Var });
}

export interface TwoBrowserPagesResult {
    context1: BrowserContext;
    page1: Page;
    context2: BrowserContext;
    page2: Page;
    projectId: string;
}

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

    const { context: context1, page: page1 } = await initializeBrowserPage(
        browser,
        {
            requireAuth: true,
            consolePrefix: page1Prefix,
        },
    );

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

    await reconnectProvider(page1, page1ProviderVar);

    const { context: context2, page: page2 } = await initializeBrowserPage(
        browser,
        {
            requireAuth: true,
            consolePrefix: page2Prefix,
        },
    );

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

export async function prepareTwoFullBrowserPages(
    browser: Browser,
    testInfo: { title: string; },
    initialItems: string[],
    TestHelpers: {
        seedProjectAndNavigate: (
            page: Page,
            testInfo: TestInfo,
            initialItems?: string[],
        ) => Promise<{ projectName: string; pageName: string; }>;
    },
): Promise<{
    context1: BrowserContext;
    page1: Page;
    context2: BrowserContext;
    page2: Page;
    projectName: string;
    pageName: string;
}> {
    const context1 = await browser.newContext();
    const page1 = await context1.newPage();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { projectName, pageName } = await TestHelpers.seedProjectAndNavigate(page1, testInfo as any, initialItems);
    const pageUrl = page1.url();
    const context2 = await browser.newContext();
    const page2 = await context2.newPage();
    await page2.goto(pageUrl, { waitUntil: "domcontentloaded" });
    return { context1, page1, context2, page2, projectName, pageName };
}
