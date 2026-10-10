import { type Browser, type BrowserContext, expect, type Page } from "@playwright/test";
import { type CatalogSnapshot } from "./catalogBrowserServer";
import { configureCatalogPage, gridValues, INITIAL_ORDER, installCatalogControls } from "./catalogBrowserUi";

export async function freshCatalogRoute(browser: Browser, port: number, url: string) {
    // A new context has neither IndexedDB/localStorage state nor an existing
    // PGlite instance. The normal route authenticates and synchronizes itself.
    const context = await browser.newContext();
    const page = await context.newPage();
    await configureCatalogPage(page, port);
    try {
        await page.goto(url);
        await page.waitForFunction(() => Boolean((globalThis as any).__USER_MANAGER__?.auth.currentUser));
        await installCatalogControls(page);
        return { context, page };
    } catch (error) {
        await context.close();
        throw error;
    }
}
export async function sourceReached(page: Page, source: string) {
    await expect.poll(() =>
        page.evaluate(() => (globalThis as any).__catalogBrowserTest.source().snapshot?.objects[0]?.source)
    ).toBe(source);
}
export async function readySourceReached(page: Page, source: string) {
    await expect.poll(() =>
        page.evaluate(
            value =>
                (globalThis as any).__catalogBrowserTest.barrier().publications.some(state =>
                    state.status === "ready" && state.sources?.includes(value)
                ),
            source,
        )
    ).toBe(true);
}
export async function verifyFreshCatalogRoutes(
    browser: Browser,
    port: number,
    fixture: { base: string; tableId: string; gridId: string; calendarId: string; },
    initial: CatalogSnapshot,
) {
    const contexts: BrowserContext[] = [];
    try {
        const gridClient = await freshCatalogRoute(browser, port, `${fixture.base}/-/grids/${fixture.gridId}`);
        contexts.push(gridClient.context);
        await expect.poll(() => gridValues(gridClient.page)).toEqual(INITIAL_ORDER);
        expect(await gridClient.page.evaluate(id => (globalThis as any).__catalogBrowserTest.sync(id), fixture.tableId))
            .toEqual({ project: "synced", table: "synced" });
        expect(
            await gridClient.page.locator('td[data-col="state"] select').first().locator("option").evaluateAll(
                options => options.slice(1).map(option => (option as HTMLOptionElement).value),
            ),
        ).toEqual(INITIAL_ORDER.slice(0, -1));
        await gridClient.context.close();
        contexts.pop();
        const tableClient = await freshCatalogRoute(browser, port, `${fixture.base}/-/tables/${fixture.tableId}`);
        contexts.push(tableClient.context);
        await expect(tableClient.page.getByTestId("table-entity-view")).toBeVisible();
        await expect(tableClient.page.locator('td[data-col="state"] select')).toHaveCount(5);
        expect(
            await tableClient.page.evaluate(
                id => (globalThis as any).__catalogBrowserTest.snapshot(id),
                fixture.tableId,
            ),
        ).toEqual(initial.table);
        await tableClient.context.close();
        contexts.pop();
        const calendarClient = await freshCatalogRoute(
            browser,
            port,
            `${fixture.base}/-/calendars/${fixture.calendarId}`,
        );
        contexts.push(calendarClient.context);
        await expect(calendarClient.page.getByText("Open", { exact: true }).first()).toBeVisible();
        await expect(calendarClient.page.getByTestId("calendar-query-error")).toHaveCount(0);
    } finally {
        for (const context of contexts) await context.close();
    }
}
