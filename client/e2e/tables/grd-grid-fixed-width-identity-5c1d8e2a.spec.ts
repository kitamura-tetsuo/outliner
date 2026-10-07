/** @feature GRD-5c1d8e2a */
import type { Page } from "@playwright/test";
import "../utils/registerAfterEachSnapshot";
import { expect, test } from "../fixtures/grid-render-trace";
import { addSourceRecord, configureGrid, createBlankGrid } from "../utils/crossProjectGridHelpers";
import { commitWidthsProduction, singleGridId } from "../utils/gridWidthHelpers";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
import { SqlEditorHelper } from "../utils/sqlEditorHelpers";
import { TestHelpers } from "../utils/testHelpers";
registerCoverageHooks();

const SCHEMA = "CREATE TABLE orders (\n  id TEXT PRIMARY KEY,\n  title TEXT NOT NULL,\n"
    + "  quantity INTEGER,\n  done BOOLEAN\n)";
const QUERY = "SELECT id, title, quantity, done FROM orders";
const ALIASED = "SELECT id, title AS subject, quantity, done FROM orders";

// Same production-writer width commit as the geometry spec: widths go through
// `setGridColumnWidth` on the owning Grid's handles (writer contract in
// `gridColumnWidth.test.ts`); everything from Yjs observation to pixels is the
// production path.
const commitWidths = (page: Page, widths: Record<string, number>): Promise<void> =>
    singleGridId(page).then((gridId) => commitWidthsProduction(page, gridId, widths));

async function setQuery(page: Page, query: string) {
    const view = page.getByTestId("yjs-table-view").first();
    if (!await view.getByTestId("yjs-table-query-input").isVisible().catch(() => false)) {
        await view.getByTestId("yjs-table-toggle-ui").click();
    }
    await new SqlEditorHelper(view.getByTestId("yjs-table-query-input")).fillAndCommit(page, query);
}

async function headerWidth(page: Page, column: string): Promise<number | undefined> {
    return (await page.getByTestId("yjs-table-grid").locator(`th[data-col="${column}"]`).boundingBox())?.width;
}

test.describe("Grid fixed widths follow result names, not positions", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        test.setTimeout(180000);
        await TestHelpers.seedProjectAndNavigate(page, testInfo, ["page 1"]);
        await createBlankGrid(page, "Widths", "width_identities");
        await configureGrid(page, 0, SCHEMA, QUERY, "Order title");
        await addSourceRecord(page);
        await commitWidths(page, { title: 180, done: 48 });
        // configureGrid hides `done` for its own setup; these specs measure it.
        const setupView = page.getByTestId("yjs-table-view").first();
        if (!await setupView.getByTestId("yjs-table-query-input").isVisible().catch(() => false)) {
            await setupView.getByTestId("yjs-table-toggle-ui").click();
        }
        await setupView.getByTestId("yjs-table-hidden-done").check();
        const grid = page.getByTestId("yjs-table-grid");
        await expect(grid.locator('th[data-col="title"]')).toBeVisible({ timeout: 30000 });
    });

    test("reorder, hide and restore keep widths on their result names", async ({ page }) => {
        const grid = page.getByTestId("yjs-table-grid");
        await grid.locator('th[data-col="title"]').press("Alt+ArrowRight");
        await expect.poll(() => headerWidth(page, "title"), { timeout: 30000 }).toBeLessThanOrEqual(181);
        expect(await headerWidth(page, "title")).toBeGreaterThanOrEqual(179);

        const view = page.getByTestId("yjs-table-view").first();
        if (!await view.getByTestId("yjs-table-query-input").isVisible().catch(() => false)) {
            await view.getByTestId("yjs-table-toggle-ui").click();
        }
        // Duplicate the title label onto an auto column: widths resolve by
        // exact result-column name, so the 180px pin must stay on title.
        const quantityLabel = view.getByTestId("yjs-table-label-quantity");
        await quantityLabel.fill("Order title");
        await quantityLabel.evaluate((e) => e.blur());
        await expect(grid.locator('th[data-col="quantity"]')).toHaveText("Order title");
        expect(await headerWidth(page, "title")).toBeGreaterThanOrEqual(179);
        expect(await headerWidth(page, "title")).toBeLessThanOrEqual(181);

        // The visibility checkbox is a "shown" flag: unchecking hides.
        const shownCheckbox = view.getByTestId("yjs-table-hidden-done");
        await expect(shownCheckbox).toBeChecked();
        await shownCheckbox.uncheck();
        await expect(grid.locator('th[data-col="done"]')).toHaveCount(0, { timeout: 30000 });
        await expect(grid.locator('td[data-col="done"]')).toHaveCount(0);
        await shownCheckbox.check();
        await expect.poll(() => headerWidth(page, "done"), { timeout: 30000 }).toBeLessThanOrEqual(49);
        expect(await headerWidth(page, "done")).toBeGreaterThanOrEqual(47);
    });

    test("omitted names stay dormant and reload restores committed widths", async ({ page }) => {
        const grid = page.getByTestId("yjs-table-grid");
        await setQuery(page, ALIASED);
        await expect(grid.locator('th[data-col="subject"]')).toBeVisible({ timeout: 30000 });
        await expect(grid.locator('th[data-col="title"]')).toHaveCount(0, { timeout: 30000 });

        // The dormant `title` width stays saved while its name is absent.
        const dormant = await page.evaluate(() => {
            const store = (globalThis as unknown as { __YJS_STORE__?: unknown; }).__YJS_STORE__ as
                | { yjsClient?: { getProject: () => unknown; }; }
                | undefined;
            const project = store?.yjsClient?.getProject() as {
                ydoc: {
                    getMap: (k: string) => { forEach: (fn: (e: { get: (k: string) => unknown; }) => void) => void; };
                };
            };
            let width: unknown;
            project.ydoc.getMap("yjsGrids").forEach((entry) => {
                const components = entry.get("components") as {
                    get: (c: string) => { get: (k: string) => unknown; } | undefined;
                };
                width = components?.get("title")?.get("widthPx");
            });
            return width;
        });
        expect(dormant).toBe(180);

        await setQuery(page, QUERY);
        await expect.poll(() => headerWidth(page, "title"), { timeout: 30000 }).toBeLessThanOrEqual(181);
        await page.reload();
        await expect(grid.locator('th[data-col="title"]')).toBeVisible({ timeout: 30000 });
        await expect.poll(() => headerWidth(page, "title"), { timeout: 30000 }).toBeLessThanOrEqual(181);
        expect(await headerWidth(page, "title")).toBeGreaterThanOrEqual(179);
    });
});
