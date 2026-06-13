import { HocuspocusProvider } from "@hocuspocus/provider";
import { type TestInfo } from "@playwright/test";
import type { Browser, BrowserContext, Page } from "@playwright/test";
import * as Y from "yjs";

export async function waitForSyncedAndDataForTest(
    provider: HocuspocusProvider,
    checkDataAvailable: () => boolean,
    options: { timeoutMs?: number; pollIntervalMs?: number; label?: string; } = {},
): Promise<boolean> {
    const { timeoutMs = 30000, pollIntervalMs = 100, label = "yjs-sync" } = options;
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
        const doc = (window as any)[docVar];
        if (!doc) return;
        (window as any)[counterVar] = 0;
        (window as any)[counterV2Var] = 0;
        doc.on("update", () => {
            (window as any)[counterVar]++;
        });
        doc.on("updateV2", () => {
            (window as any)[counterV2Var]++;
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
): Promise<any> {
    const context1 = await browser.newContext();
    const page1 = await context1.newPage();
    const { projectName, pageName } = await (TestHelpers as any).seedProjectAndNavigate(page1, testInfo, initialItems);
    const pageUrl = page1.url();
    const context2 = await browser.newContext();
    const page2 = await context2.newPage();
    await page2.goto(pageUrl, { waitUntil: "domcontentloaded" });
    return { context1, page1, context2, page2, projectName, pageName };
}
