/** @feature GRD-5c1d8e2a */
import type { Locator } from "@playwright/test";
import "../utils/registerAfterEachSnapshot";
import { expect, test } from "../fixtures/grid-render-trace";
import { addSourceRecord, readGridProjectState } from "../utils/crossProjectGridHelpers";
import { prepareAllFixedWidthGrid } from "../utils/gridAllFixedWidthFixture";
import { commitWidthsProduction, expectFixedWidth, singleGridId } from "../utils/gridWidthHelpers";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();

const selectedAddresses = (grid: Locator) =>
    grid.locator('td[aria-selected="true"]').evaluateAll((cells) =>
        cells.map((cell) => [cell.getAttribute("data-record-id"), cell.getAttribute("data-col")]).sort()
    );

test.describe("Grid width updates preserve logical selection identities", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        await prepareAllFixedWidthGrid(page, testInfo);
        await addSourceRecord(page);
        await addSourceRecord(page, 0, 2);
    });

    test("setting and clearing a width preserves the exact selected record", async ({ page }) => {
        const grid = page.getByTestId("yjs-table-grid").first();
        const row = grid.locator("tbody tr").nth(1);
        const recordId = await row.getAttribute("data-record-id");
        expect(recordId).toBeTruthy();
        const state = await readGridProjectState(page);
        await row.getByRole("rowheader").click();
        const expected = ["done", "id", "quantity", "title"].map((column) => [recordId, column]).sort();
        await expect.poll(() => selectedAddresses(grid)).toEqual(expected);

        for (const width of [240, undefined]) {
            await commitWidthsProduction(page, await singleGridId(page), { title: width });
            if (width !== undefined) await expectFixedWidth(page, 0, "title", width);
            else await expect(grid.locator('th[data-col="title"]')).not.toHaveClass(/col-fixed/);
            await expect.poll(() => selectedAddresses(grid)).toEqual(expected);
            await expect(grid.locator('th.row-header[aria-selected="true"]')).toHaveCount(1);
            await expect(row.getByRole("rowheader")).toHaveAttribute("aria-selected", "true");
            expect((await readGridProjectState(page)).tables[0].data).toEqual(state.tables[0].data);
        }
    });

    test("setting and clearing a reordered column preserves its exact selected cell addresses", async ({ page }) => {
        const grid = page.getByTestId("yjs-table-grid").first();
        const title = grid.locator('th[data-col="title"]');
        await title.press("Alt+ArrowRight");
        await expect.poll(() =>
            grid.locator("thead th[data-col]").evaluateAll((headers) =>
                headers.map((header) => header.getAttribute("data-col"))
            )
        ).toEqual(["id", "quantity", "title", "done"]);
        const state = await readGridProjectState(page);
        const expected = Object.keys(state.tables[0].data).map((recordId) => [recordId, "title"]).sort();
        expect(expected).toHaveLength(2);
        await title.click();
        await expect.poll(() => selectedAddresses(grid)).toEqual(expected);

        for (const width of [240, undefined]) {
            await commitWidthsProduction(page, await singleGridId(page), { title: width });
            if (width !== undefined) await expectFixedWidth(page, 0, "title", width);
            else await expect(title).not.toHaveClass(/col-fixed/);
            await expect.poll(() => selectedAddresses(grid)).toEqual(expected);
            await expect(title).toHaveAttribute("aria-selected", "true");
            await expect(grid.locator('thead th[aria-selected="true"]')).toHaveCount(1);
            expect((await readGridProjectState(page)).tables[0].data).toEqual(state.tables[0].data);
        }
    });
});
