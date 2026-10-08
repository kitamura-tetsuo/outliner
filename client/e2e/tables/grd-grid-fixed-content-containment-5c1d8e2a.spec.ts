/** @feature GRD-5c1d8e2a */
import type { Locator, Page } from "@playwright/test";
import "../utils/registerAfterEachSnapshot";
import { expect, test } from "../fixtures/grid-render-trace";
import { addSourceRecord, createBlankGrid, readGridProjectState, setCellValue } from "../utils/crossProjectGridHelpers";
import {
    expectNeighborUncovered,
    expectTextPaintClipped,
    expectTextWrappedWithin,
    expectWithin,
} from "../utils/gridPaintContainmentHelpers";
import {
    commitWidthsProduction,
    expectFixedWidth,
    placementColumnWidths,
    readWidthGridRegistry,
    singleGridId,
} from "../utils/gridWidthHelpers";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
import { SqlEditorHelper } from "../utils/sqlEditorHelpers";
import { TestHelpers } from "../utils/testHelpers";
registerCoverageHooks();

const LONG_LABEL = `VeryLongUnbreakableColumnDisplayLabel${"x".repeat(70)}`;
const LONG_WORD = `y`.repeat(120);
const LONG_OPTION = `SuperLongUnbreakableStatusOption${"z".repeat(40)}`;
const SCHEMA = "CREATE TABLE items (\n  id TEXT PRIMARY KEY,\n  title TEXT NOT NULL,\n"
    + `  status TEXT CHECK (status IN ('open', 'done', '${LONG_OPTION}')),\n`
    + "  due_date DATE,\n  note TEXT\n)";
const QUERY = "SELECT id, title, status, due_date, note FROM items";
const DATE_VALUE = "2026-08-01";
const NARROW = [["title", 120], ["status", 80], ["due_date", 110]] as const;

// Issue #5457 REQ-007 (AS-002): track widths alone cannot prove descendants
// stay inside a fixed column. This spec pins narrow widths over long labels,
// values, select options and a date control, then asserts descendant positions
// before and during editing, with stored data intact.
function cellOf(page: Page, tag: string, column: string, row: number): Locator {
    return page.getByTestId("yjs-table-view").first().getByTestId("yjs-table-grid")
        .locator(`${tag}[data-col="${column}"]`).nth(row);
}

test.describe("Grid fixed columns contain long content, controls and editors", () => {
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
        if (!await view.getByTestId("yjs-table-query-input").isVisible().catch(() => false)) {
            await view.getByTestId("yjs-table-toggle-ui").click();
        }
        await new SqlEditorHelper(view.getByTestId("yjs-table-query-input")).fillAndCommit(page, QUERY);
        const labelInput = view.getByTestId("yjs-table-label-title");
        await expect(labelInput).toBeVisible({ timeout: 30000 });
        await labelInput.fill(LONG_LABEL);
        await labelInput.evaluate((e) => e.blur());
        await addSourceRecord(page);
        await addSourceRecord(page, 0, 2);
        const grid = view.getByTestId("yjs-table-grid");
        // The query carries no ORDER BY, so rendered row positions are not
        // stable: address every setup cell by its record id instead.
        const firstRowId = await grid.locator('td[data-col="title"]').first().getAttribute("data-record-id");
        const ids = Object.keys((await readGridProjectState(page)).tables[0].data);
        const otherId = ids.find((id) => id !== firstRowId)!;
        await setCellValue(page, 0, firstRowId!, "title", LONG_WORD);
        await setCellValue(page, 0, firstRowId!, "note", "sentinel-one");
        await setCellValue(page, 0, otherId, "note", "sentinel-two");
        const statusSelect = grid.locator(`td[data-record-id="${firstRowId}"][data-col="status"] select.cell-select`);
        await statusSelect.selectOption(LONG_OPTION);
        await expect(statusSelect).toHaveValue(LONG_OPTION, { timeout: 15000 });
        const dateInput = grid.locator(`td[data-record-id="${firstRowId}"][data-col="due_date"] input.cell-date`);
        await dateInput.fill(DATE_VALUE);
        await dateInput.evaluate((e) => e.blur());
        const storedDate = async () => (await readGridProjectState(page)).tables[0].data[firstRowId!]["due_date"];
        await expect.poll(storedDate, { timeout: 30000 }).toBe(DATE_VALUE);
        await commitWidthsProduction(page, await singleGridId(page), { title: 120, status: 80, due_date: 110 });
        await expect(grid.locator('th[data-col="title"]')).toBeVisible({ timeout: 30000 });
    });

    test("long labels, values and controls stay inside fixed tracks", async ({ page }) => {
        const grid = page.getByTestId("yjs-table-view").first().getByTestId("yjs-table-grid");
        for (const [column, px] of NARROW) await expectFixedWidth(page, 0, column, px);

        // The long label genuinely overflows its header (clipping engaged, not vacuous).
        const labelOverflow = await grid.locator('th[data-col="title"] .th-label').evaluate((el) =>
            el.scrollWidth > el.clientWidth + 1
        );
        expect(labelOverflow).toBe(true);
        await expectTextPaintClipped(grid.locator('th[data-col="title"] .th-label'));
        // Body text wraps within its pinned width (issue #5502) instead of
        // clipping with an ellipsis: the long value spans multiple lines,
        // never overflows its element, and paints inside the fixed cell.
        // Headers keep the ellipsis policy asserted above.
        await expectTextWrappedWithin(
            grid.locator('td[data-col="title"] button.cell-value').filter({ hasText: LONG_WORD }),
        );
        await expectWithin(
            grid.locator('th[data-col="title"] .th-label').first(),
            grid.locator('th[data-col="title"]').first(),
        );
        for (
            const [column, inner] of [
                ["title", "button.cell-value"],
                ["status", "select.cell-select"],
                ["due_date", "input.cell-date"],
            ] as const
        ) {
            await expectWithin(cellOf(page, "td", column, 0).locator(inner), cellOf(page, "td", column, 0));
        }

        // The auto sentinel neighbor starts where the last fixed track ends.
        const fixedBox = await (cellOf(page, "td", "due_date", 0)).boundingBox();
        const noteBox = await (cellOf(page, "td", "note", 0)).boundingBox();
        expect(noteBox!.x).toBeGreaterThanOrEqual(fixedBox!.x + fixedBox!.width - 1);
        // Row order is unstable without ORDER BY, so assert the sentinel set.
        const noteTexts = await grid.locator('td[data-col="note"] button.cell-value').allTextContents();
        expect([...noteTexts].sort()).toEqual(["sentinel-one", "sentinel-two"]);
        await expectNeighborUncovered(cellOf(page, "td", "note", 0));

        // Stored labels and values are unchanged by clipping.
        const state = await readGridProjectState(page);
        const storedId = Object.keys(state.tables[0].data).find((id) =>
            state.tables[0].data[id]["title"] === LONG_WORD
        )!;
        expect(state.tables[0].data[storedId]["status"]).toBe(LONG_OPTION);
        expect(state.tables[0].data[storedId]["due_date"]).toBe(DATE_VALUE);
        expect((await readWidthGridRegistry(page))[0].components["title"]?.["label"]).toBe(LONG_LABEL);

        // A focused inline editor stays inside its fixed track.
        const cell = grid.locator('td[data-col="title"]').first();
        await cell.locator("button.cell-value").click();
        const editor = cell.locator("input.cell-input");
        await expect(editor).toBeVisible({ timeout: 15000 });
        await expectWithin(editor, cell);
        for (const w of await placementColumnWidths(page, 0, "title")) {
            expect(w).toBeGreaterThanOrEqual(119);
            expect(w).toBeLessThanOrEqual(121);
        }
        const neighborBox = await grid.locator('td[data-col="status"]').first().boundingBox();
        const editorBox = await editor.boundingBox();
        expect(editorBox!.x + editorBox!.width).toBeLessThanOrEqual(neighborBox!.x + 1);
        await expectNeighborUncovered(cellOf(page, "td", "status", 0));
        await page.keyboard.press("Escape");
        await expectFixedWidth(page, 0, "title", 120);
    });
});
