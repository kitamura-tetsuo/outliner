/** @feature GRD-5c1d8e2a */
import "../utils/registerAfterEachSnapshot";
import { expect, test } from "../fixtures/grid-render-trace";
import { addSourceRecord } from "../utils/crossProjectGridHelpers";
import { prepareAllFixedWidthGrid } from "../utils/gridAllFixedWidthFixture";
import {
    commitWidthsProduction,
    expectAutoColumn,
    placementColumnWidths,
    readWidthGridRegistry,
    singleGridId,
} from "../utils/gridWidthHelpers";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();

test.describe("Grid returns to automatic widths", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        await prepareAllFixedWidthGrid(page, testInfo);
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

        // Actual browser geometry in both container sizes: the automatic
        // layout must respond to available space. A regression pinning
        // hard-coded widths through another CSS rule would keep every track
        // constant across sizes and fail the growth assertions below; no
        // particular allocation among the auto columns is asserted.
        const measured: Record<number, { table: number; columns: Record<string, number[]>; }> = {};
        for (const width of [480, 1280]) {
            await page.setViewportSize({ width, height: 800 });
            const grid = page.getByTestId("yjs-table-view").first().getByTestId("yjs-table-grid");
            await expect(grid.locator('th[data-col="title"]')).toBeVisible({ timeout: 30000 });
            expect(await grid.locator("table").getAttribute("class")).not.toContain("grid-fixed-layout");
            expect(await grid.locator("colgroup").count()).toBe(0);
            for (const column of ["id", "title", "done", "quantity"]) await expectAutoColumn(page, 0, column);
            const tableBox = await grid.locator("table").boundingBox();
            expect(tableBox).not.toBeNull();
            const columns: Record<string, number[]> = {};
            for (const column of ["id", "title", "done", "quantity"]) {
                columns[column] = await placementColumnWidths(page, 0, column);
                // Header plus one body cell: every measured outer box exists.
                expect(columns[column].length).toBeGreaterThanOrEqual(2);
                // Header and body cells of one column share a track and stay
                // aligned in the automatic layout as well.
                for (const w of columns[column]) {
                    expect(Math.abs(w - columns[column][0])).toBeLessThanOrEqual(2);
                }
            }
            measured[width] = { table: tableBox!.width, columns };
            // REQ-002 allows content-sized automatic columns. Their intrinsic
            // minimum can exceed a narrow container; REQ-003 requires that
            // overflow to stay inside the Grid rather than widen the page.
            expect(await grid.evaluate((el) => getComputedStyle(el).overflowX)).toBe("auto");
            expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
        }

        // The table fills its container, so it is substantially wider in the
        // wide container than in the narrow one.
        expect(measured[1280].table).toBeGreaterThan(measured[480].table + 100);
        // At least one automatic column absorbs the extra room.
        const headerDeltas = ["id", "title", "done", "quantity"]
            .map((column) => Math.abs(measured[1280].columns[column][0] - measured[480].columns[column][0]));
        expect(Math.max(...headerDeltas)).toBeGreaterThan(10);
    });
});
