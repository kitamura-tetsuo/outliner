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
    const { requireAuth = true, disableIndexedDB = true } = options;
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.addInitScript(({ requireAuth, disableIDB }) => {
        localStorage.setItem("VITE_IS_TEST", "true");
        if (disableIDB) localStorage.setItem("VITE_DISABLE_YJS_INDEXEDDB", "true");
        if (requireAuth) localStorage.setItem("VITE_YJS_REQUIRE_AUTH", "true");
    }, { requireAuth, disableIDB: disableIndexedDB });
    await page.goto("http://127.0.0.1:7090/", { waitUntil: "domcontentloaded" });
    return { context, page };
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

export async function prepareTwoFullBrowserPages(
    browser: Browser,
    testInfo: { title: string; },
    initialItems: string[],
    TestHelpers: {
        expectEmptyOutliner: (page: Page) => Promise<void>;
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
    const { projectName, pageName } = await TestHelpers.seedProjectAndNavigate(page1, testInfo, initialItems);
    const pageUrl = page1.url();
    const context2 = await browser.newContext();
    const page2 = await context2.newPage();
    await page2.goto(pageUrl, { waitUntil: "domcontentloaded" });
    return { context1, page1, context2, page2, projectName, pageName };
}
