/** @feature GRD-5c1d8e2a */
import type { Page } from "@playwright/test";
import "../utils/registerAfterEachSnapshot";
import { expect, test } from "../fixtures/grid-render-trace";
import { addSourceRecord, createBlankGrid, readGridProjectState, setCellValue } from "../utils/crossProjectGridHelpers";
import { expectTextWrappedWithin, rowBoxOf, rowsContiguous } from "../utils/gridPaintContainmentHelpers";
import { commitWidthsProduction, expectFixedWidth, singleGridId } from "../utils/gridWidthHelpers";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
import { SqlEditorHelper } from "../utils/sqlEditorHelpers";
import { TestHelpers } from "../utils/testHelpers";
registerCoverageHooks();

const LONG_WORD = `y`.repeat(120);
const SCHEMA = "CREATE TABLE items (\n  id TEXT PRIMARY KEY,\n  title TEXT NOT NULL,\n  note TEXT\n)";
const BASE_QUERY = "SELECT id, title, note FROM items";
const ALIASED_QUERY = "SELECT id, title AS subject, note FROM items";
const NARROW = 120;
const WIDE = 480;

// Issue #5502 REQ-001/REQ-002: the fixed-width wrapping oracle must reject a
// display that wraps horizontally but hides its lower lines vertically, and
// row heights must track the current width and content instead of retaining a
// historical maximum. Widths always go through the production writer.
function titleCell(page: Page, recordId: string, column: string = "title") {
    return page.getByTestId("yjs-table-view").first().getByTestId("yjs-table-grid")
        .locator(`td[data-record-id="${recordId}"][data-col="${column}"]`);
}

async function setQuery(page: Page, query: string) {
    const view = page.getByTestId("yjs-table-view").first();
    if (!await view.getByTestId("yjs-table-query-input").isVisible().catch(() => false)) {
        await view.getByTestId("yjs-table-toggle-ui").click();
    }
    await new SqlEditorHelper(view.getByTestId("yjs-table-query-input")).fillAndCommit(page, query);
}

test.describe("Grid fixed-column wrapping shows every line and rows reflow", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        test.setTimeout(180000);
        await TestHelpers.seedProjectAndNavigate(page, testInfo, ["page 1"]);
        await createBlankGrid(page, "Widths", "width_items");
        const view = page.getByTestId("yjs-table-view").first();
        if (!await view.getByTestId("yjs-table-schema-input").isVisible().catch(() => false)) {
            await view.getByTestId("yjs-table-toggle-schema").click();
        }
        const schemaEditor = new SqlEditorHelper(view.getByTestId("yjs-table-schema-input"));
        await schemaEditor.waitForReady();
        await schemaEditor.setValue(page, SCHEMA);
        await view.getByTestId("yjs-table-schema-apply").click();
        const warning = view.getByTestId("yjs-table-schema-warning");
        if (await warning.isVisible().catch(() => false)) await view.getByTestId("yjs-table-schema-confirm").click();
        await expect.poll(async () => await schemaEditor.value(), { timeout: 30000 }).toBe(SCHEMA);
        await setQuery(page, BASE_QUERY);
        await addSourceRecord(page);
        await addSourceRecord(page, 0, 2);
        const grid = view.getByTestId("yjs-table-grid");
        // The query carries no ORDER BY, so rendered row positions are not
        // stable: address every setup cell by its record id instead.
        const firstRowId = await grid.locator('td[data-col="title"]').first().getAttribute("data-record-id");
        const ids = Object.keys((await readGridProjectState(page)).tables[0].data);
        const otherId = ids.find((id) => id !== firstRowId)!;
        await setCellValue(page, 0, firstRowId!, "title", LONG_WORD);
        await setCellValue(page, 0, otherId, "title", "brief");
        await commitWidthsProduction(page, await singleGridId(page), { title: NARROW });
        await expect(grid.locator('th[data-col="title"]')).toBeVisible({ timeout: 30000 });
    });

    test("editable and computed text show every wrapped line without vertical clipping", async ({ page }) => {
        const grid = page.getByTestId("yjs-table-view").first().getByTestId("yjs-table-grid");
        await expectFixedWidth(page, 0, "title", NARROW);
        const state = await readGridProjectState(page);
        const longId = Object.keys(state.tables[0].data).find((id) => state.tables[0].data[id]["title"] === LONG_WORD)!;
        // Editable source text: every laid-out fragment stays inside the
        // visible display and cell, with no vertical overflow and the next
        // row below the complete text.
        await expectTextWrappedWithin(titleCell(page, longId).locator("button.cell-value"));

        // The same value through a read-only alias wraps under the same
        // policy while staying read-only (issue #5502 REQ-001/REQ-006).
        await setQuery(page, ALIASED_QUERY);
        await expect(grid.locator('th[data-col="subject"]')).toBeVisible({ timeout: 30000 });
        await commitWidthsProduction(page, await singleGridId(page), { subject: NARROW });
        await expectFixedWidth(page, 0, "subject", NARROW);
        const subjectCell = titleCell(page, longId, "subject");
        await expect(subjectCell.locator("button.cell-value")).toHaveText(LONG_WORD, { timeout: 30000 });
        await expect(subjectCell.locator("button.cell-value")).toHaveAttribute("aria-disabled", "true");
        await expectTextWrappedWithin(subjectCell.locator("button.cell-value"));
        await subjectCell.locator("button.cell-value").click({ force: true });
        expect(await subjectCell.locator("input.cell-input").count()).toBe(0);
        expect((await readGridProjectState(page)).tables[0].data[longId]["title"]).toBe(LONG_WORD);
    });

    test("row height grows and contracts with width and value changes", async ({ page }) => {
        await expectFixedWidth(page, 0, "title", NARROW);
        const state = await readGridProjectState(page);
        const longId = Object.keys(state.tables[0].data).find((id) => state.tables[0].data[id]["title"] === LONG_WORD)!;
        const shortId = Object.keys(state.tables[0].data).find((id) => id !== longId)!;
        const longCell = titleCell(page, longId);
        const shortCell = titleCell(page, shortId);

        // Baseline: the wrapped long row is taller than the short row and the
        // two rows are stacked with no gap or overlap.
        const baseline = (await rowBoxOf(shortCell)).height;
        const longNarrow = (await rowBoxOf(longCell)).height;
        expect(longNarrow).toBeGreaterThan(baseline + 4);
        await expect.poll(() => rowsContiguous(longCell, shortCell), { timeout: 30000 }).toBe(true);

        // Widening removes visual lines, so the row contracts instead of
        // retaining its narrow-width height; the text stays fully wrapped.
        await commitWidthsProduction(page, await singleGridId(page), { title: WIDE });
        await expectFixedWidth(page, 0, "title", WIDE);
        await expect.poll(async () => (await rowBoxOf(longCell)).height, { timeout: 30000 })
            .toBeLessThan(longNarrow - 2);
        await expectTextWrappedWithin(longCell.locator("button.cell-value"));
        await expect.poll(() => rowsContiguous(longCell, shortCell), { timeout: 30000 }).toBe(true);

        // Restoring the narrow width and shortening the value returns the row
        // to its short-content baseline with the following row tracking it.
        await commitWidthsProduction(page, await singleGridId(page), { title: NARROW });
        await expectFixedWidth(page, 0, "title", NARROW);
        await setCellValue(page, 0, longId, "title", "brief");
        await expect.poll(async () => Math.abs((await rowBoxOf(longCell)).height - baseline), { timeout: 30000 })
            .toBeLessThanOrEqual(2);
        await expect.poll(() => rowsContiguous(longCell, shortCell), { timeout: 30000 }).toBe(true);
        expect((await readGridProjectState(page)).tables[0].data[longId]["title"]).toBe("brief");
    });
});
