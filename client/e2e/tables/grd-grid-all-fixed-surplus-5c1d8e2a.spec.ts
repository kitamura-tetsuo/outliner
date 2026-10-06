/** @feature GRD-5c1d8e2a */
import type { Page } from "@playwright/test";
import "../utils/registerAfterEachSnapshot";
import { expect, test } from "../fixtures/grid-render-trace";
import { addSourceRecord, configureGrid, createBlankGrid } from "../utils/crossProjectGridHelpers";
import {
    commitWidthsProduction,
    expectAutoColumn,
    expectFixedWidth,
    placementColumnWidths,
    readWidthGridRegistry,
    singleGridId,
} from "../utils/gridWidthHelpers";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
import { TestHelpers } from "../utils/testHelpers";
registerCoverageHooks();

const SCHEMA = "CREATE TABLE orders (\n  id TEXT PRIMARY KEY,\n  title TEXT NOT NULL,\n"
    + "  quantity INTEGER,\n  done BOOLEAN\n)";
const QUERY = "SELECT id, title, quantity, done FROM orders";
const FIXED = { id: 64, title: 180, done: 48, quantity: 96 };

// Issue #5457 REQ-007 (AS-001): with every visible data column fixed, browser
// geometry must prove fixed cells keep their saved widths in narrow AND wide
// containers, utility tracks keep theirs, and surplus stays outside the
// tracks. Commits go through the production writer on the owning Grid.
async function trackWidths(page: Page, placement: number): Promise<{
    fixed: Record<string, number[]>;
    utility: number;
    table: number;
}> {
    const grid = page.getByTestId("yjs-table-view").nth(placement).getByTestId("yjs-table-grid");
    const fixed: Record<string, number[]> = {};
    for (const column of Object.keys(FIXED)) fixed[column] = await placementColumnWidths(page, placement, column);
    // Scoped to the single thead corner cell so the lookup stays
    // strict-mode-unambiguous even though body rows also render `<th>`
    // selection headers (issue #5457).
    const utilityBox = await grid.locator("thead th.corner-header").first().boundingBox();
    const tableBox = await grid.locator("table").boundingBox();
    return { fixed, utility: utilityBox!.width, table: tableBox!.width };
}

test.describe("Grid all-fixed surplus stays outside the tracks", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        test.setTimeout(180000);
        await TestHelpers.seedProjectAndNavigate(page, testInfo, ["page 1"]);
        await createBlankGrid(page, "Widths", "width_orders");
        await configureGrid(page, 0, SCHEMA, QUERY, "Order title");
        const setupView = page.getByTestId("yjs-table-view").first();
        if (!await setupView.getByTestId("yjs-table-query-input").isVisible().catch(() => false)) {
            await setupView.getByTestId("yjs-table-toggle-ui").click();
        }
        await setupView.getByTestId("yjs-table-hidden-done").check();
        await commitWidthsProduction(page, await singleGridId(page), { ...FIXED });
        const grid = page.getByTestId("yjs-table-view").first().getByTestId("yjs-table-grid");
        await expect(grid.locator('th[data-col="title"]')).toBeVisible({ timeout: 30000 });
    });

    test("zero rows pin headers, then narrow and wide containers keep every track", async ({ page }) => {
        // Valid result with column metadata but zero rows: headers pin exactly.
        for (const [column, px] of Object.entries(FIXED)) await expectFixedWidth(page, 0, column, px);

        await addSourceRecord(page);
        await addSourceRecord(page, 0, 2);

        const grid = page.getByTestId("yjs-table-view").first().getByTestId("yjs-table-grid");
        await page.setViewportSize({ width: 480, height: 800 });
        for (const [column, px] of Object.entries(FIXED)) await expectFixedWidth(page, 0, column, px);
        const narrow = await trackWidths(page, 0);
        for (const [column, px] of Object.entries(FIXED)) {
            expect(narrow.fixed[column]).toHaveLength(3);
            for (const w of narrow.fixed[column]) {
                expect(w).toBeGreaterThanOrEqual(px - 1);
                expect(w).toBeLessThanOrEqual(px + 1);
            }
        }
        expect(
            await grid.evaluate((el: HTMLElement) => el.scrollWidth > el.clientWidth + 1),
        ).toBe(true);
        expect(await page.evaluate(() => globalThis.document.documentElement.scrollWidth <= 481)).toBe(true);

        // Widen well beyond the total track width: fixed and utility tracks
        // must not move, and surplus must lie outside them.
        await page.setViewportSize({ width: 1280, height: 800 });
        for (const [column, px] of Object.entries(FIXED)) await expectFixedWidth(page, 0, column, px);
        const wide = await trackWidths(page, 0);
        for (const column of Object.keys(FIXED)) {
            for (let i = 0; i < narrow.fixed[column].length; i++) {
                expect(Math.abs(wide.fixed[column][i] - narrow.fixed[column][i])).toBeLessThanOrEqual(1);
            }
        }
        expect(Math.abs(wide.utility - narrow.utility)).toBeLessThanOrEqual(1);
        expect(Math.abs(wide.table - narrow.table)).toBeLessThanOrEqual(1);
        const gridBox = await grid.boundingBox();
        expect(gridBox!.width).toBeGreaterThan(wide.table + 1);
        expect(
            await grid.evaluate((el: HTMLElement) => el.scrollWidth <= el.clientWidth + 1),
        ).toBe(true);
        expect(
            await page.evaluate(() => globalThis.document.documentElement.scrollWidth <= globalThis.innerWidth + 1),
        ).toBe(true);
    });

    test("clearing every override returns to automatic sizing in both sizes", async ({ page }) => {
        await addSourceRecord(page);
        const gridId = await singleGridId(page);
        await commitWidthsProduction(page, gridId, {
            id: undefined,
            title: undefined,
            done: undefined,
            quantity: undefined,
        });
        expect((await readWidthGridRegistry(page)).find((g) => g.gridId === gridId)?.components["title"]?.["widthPx"])
            .toBeUndefined();

        for (const width of [480, 1280]) {
            await page.setViewportSize({ width, height: 800 });
            const grid = page.getByTestId("yjs-table-view").first().getByTestId("yjs-table-grid");
            await expect(grid.locator('th[data-col="title"]')).toBeVisible({ timeout: 30000 });
            expect(await grid.locator("table").getAttribute("class")).not.toContain("grid-fixed-layout");
            expect(await grid.locator("colgroup").count()).toBe(0);
            for (const column of ["id", "title", "done", "quantity"]) await expectAutoColumn(page, 0, column);
        }
    });
});
