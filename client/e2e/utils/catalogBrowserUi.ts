import { expect, type Page, type TestInfo } from "@playwright/test";
import { CatalogBrowserServer } from "./catalogBrowserServer";
import { SeedClient } from "./seedClient";
import { SqlEditorHelper } from "./sqlEditorHelpers";
import { TestHelpers } from "./testHelpers";

export const INITIAL_SOURCE = "CREATE TYPE task_state AS ENUM ('Open', '', ' Done ', 'Closed')";
export const INITIAL_ORDER = ["Open", "", " Done ", "Closed", null];

export async function configureCatalogPage(page: Page, port: number) {
    await page.addInitScript(value => {
        localStorage.setItem("VITE_YJS_PORT", String(value));
        localStorage.setItem("VITE_YJS_REQUIRE_AUTH", "true");
        localStorage.setItem("VITE_IS_TEST", "true");
        localStorage.setItem("VITE_E2E_TEST", "true");
        localStorage.setItem("VITE_USE_FIREBASE_EMULATOR", "true");
        (globalThis as any).__E2E__ = true;
    }, port);
}
export async function installCatalogControls(page: Page) {
    if (await page.evaluate(() => Boolean((globalThis as any).__catalogBrowserTest))) return;
    await page.addScriptTag({ type: "module", url: "/src/tests/fixtures/catalog-browser-controls.mjs" });
    await page.waitForFunction(() => Boolean((globalThis as any).__catalogBrowserTest));
}
export async function navigateCatalog(page: Page, url: string) {
    await page.evaluate(next => (globalThis as any).__catalogBrowserTest.goto(next), url);
    await expect(page).toHaveURL(url);
}
export async function gridValues(page: Page) {
    return page.locator('[data-testid="yjs-table-grid"] td[data-col="state"] select').evaluateAll(elements =>
        elements.map(element => {
            const select = element as HTMLSelectElement;
            return select.selectedIndex === 0 ? null : select.value;
        })
    );
}
export async function createTypedTable(page: Page) {
    await page.locator(".outliner-item").first().click();
    await page.getByTestId("main-toolbar").locator(".add-database-btn").last().click();
    await expect(page.getByTestId("yjs-table-create-panel")).toBeVisible();
    await page.getByTestId("yjs-table-name-input").fill("Catalog Tasks");
    await page.getByTestId("yjs-table-sql-name-input").fill("catalog_tasks");
    await page.getByTestId("yjs-table-preset-select").selectOption("blank");
    await page.getByTestId("yjs-table-create").click();
    await expect(page.getByTestId("yjs-table-grid")).toBeVisible();
    await page.getByTestId("yjs-grid-source-table-link").click();
    await expect(page.getByTestId("table-entity-view")).toBeVisible();
    await installCatalogControls(page);
    const tableId = await page.getByTestId("table-entity-view").getAttribute("data-table-id");
    if (!tableId) throw new Error("Table route must expose its actual identity");
    await page.getByTestId("table-entity-toggle-schema").click();
    const editor = SqlEditorHelper.byTestId(page, "yjs-table-schema-input");
    await editor.waitForReady();
    await editor.setValue(
        page,
        "CREATE TABLE catalog_tasks (id TEXT PRIMARY KEY, title TEXT NOT NULL, done BOOLEAN, state task_state)",
    );
    await page.getByTestId("yjs-table-schema-apply").click();
    await expect(page.getByTestId("yjs-table-schema-apply")).toHaveText("Apply schema");
    await expect(page.getByTestId("yjs-table-schema-error")).toHaveCount(0);
    await expect(page.locator('th[data-col="state"]')).toBeVisible();
    await page.getByTestId("table-entity-toggle-schema").click();
    for (const value of INITIAL_ORDER) {
        const before = await page.evaluate(
            id => Object.keys((globalThis as any).__catalogBrowserTest.snapshot(id).records),
            tableId,
        );
        await page.getByTestId("yjs-table-add-row").click();
        await expect.poll(() =>
            page.evaluate(
                id => Object.keys((globalThis as any).__catalogBrowserTest.snapshot(id).records).length,
                tableId,
            )
        ).toBe(before.length + 1);
        const id = await page.evaluate(
            ({ tableId, before }) =>
                Object.keys((globalThis as any).__catalogBrowserTest.snapshot(tableId).records).find(id =>
                    !before.includes(id)
                ),
            { tableId, before },
        );
        const select = page.locator(`tr[data-record-id="${id}"] td[data-col="state"] select`);
        await expect(select).toBeEnabled();
        await select.focus();
        // String selectOption arguments also match visible labels. Both SQL
        // NULL and the empty ENUM label look blank, so identify the exact value.
        if (value !== null) await select.selectOption({ value });
        else await select.selectOption({ index: 0 });
        await expect.poll(() =>
            page.evaluate(
                ({ tableId, id }) => (globalThis as any).__catalogBrowserTest.snapshot(tableId).records[id].state,
                { tableId, id },
            )
        ).toBe(value);
        await expect(select).toBeEnabled();
    }
    return tableId;
}
export async function authorCatalogFixture(page: Page, server: CatalogBrowserServer, info: TestInfo) {
    const title = `Catalog browser ${info.workerIndex} ${Date.now()}`;
    const projectId = SeedClient.stableIdFromTitle(title);
    const pageName = "Catalog workspace";
    const seeded = await server.request("seed", {
        token: await TestHelpers.getTestAuthToken(),
        projectId,
        title,
        pageName,
    });
    const identity = { projectId, uid: seeded.uid };
    expect((await server.request("apply", { ...identity, source: INITIAL_SOURCE })).status).toBe("applied");
    await configureCatalogPage(page, server.port);
    await TestHelpers.seedProjectAndNavigate(page, info, [], undefined, {
        projectName: title,
        pageName,
        skipSeed: true,
        ws: "force",
    });
    await installCatalogControls(page);
    expect(await page.evaluate(() => (globalThis as any).__catalogBrowserTest.identity())).toEqual(identity);
    const tableId = await createTypedTable(page);
    const views = await page.evaluate(id => (globalThis as any).__catalogBrowserTest.createViews(id), tableId);
    const table = await page.evaluate(id => (globalThis as any).__catalogBrowserTest.snapshot(id), tableId);
    await expect.poll(() => server.request("snapshot", { projectId, tableId })).toMatchObject({
        table,
        project: {
            grids: { [views.gridId]: expect.any(Object) },
            calendars: { [views.calendarId]: expect.any(Object) },
        },
    });
    const base = `${new URL(page.url()).origin}/${encodeURIComponent(title)}`;
    return {
        ...identity,
        tableId,
        ...views,
        base,
        projectUrl: `${base}/${encodeURIComponent(pageName)}?isTest=true`,
    };
}
