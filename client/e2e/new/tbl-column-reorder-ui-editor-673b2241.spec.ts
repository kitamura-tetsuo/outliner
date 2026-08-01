import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
/** @feature TBL-673b2241
 *  Title   : Table column reordering
 *  Source  : docs/client-features/tbl-column-reorder-673b2241.yaml
 *
 *  Dragging rows in the UI Definition editor, and agreement with the grid.
 *  The grid-header drag lives in tbl-column-reorder-673b2241.spec.ts.
 */
import { expect, test } from "@playwright/test";
import {
    createTasksTableBlock,
    dragColumnHeader,
    dragUiEditorRow,
    gridHeaderOrder,
    TASKS_PRESET_COLUMNS,
    uiEditorRowOrder,
} from "../utils/tableColumnDragHelpers";
import { TestHelpers } from "../utils/testHelpers";

/**
 * The editor lists every schema column; the grid only lists the columns the
 * query returns. These two trail the preset's query columns.
 */
const SCHEMA_ONLY_COLUMNS = ["created_at", "completed_at"];

test.describe("TBL-673b2241: reordering columns in the UI Definition editor", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        test.setTimeout(120000);
        await TestHelpers.seedProjectAndNavigate(page, testInfo, ["Table host item"]);
        await TestHelpers.waitForOutlinerItems(page, 2, 10000); // Title + 1 seeded item
        // Address the host by `data-item-id` so the scenario never depends on rendered order.
        await createTasksTableBlock(page, await TestHelpers.getItemIdByIndex(page, 1));
        await page.getByTestId("yjs-table-toggle-ui").first().click();
        await expect(page.getByTestId("yjs-table-ui-editor").first()).toBeVisible({ timeout: 10000 });
    });

    test("dragging an editor row reorders the column, and the grid agrees", async ({ page }) => {
        expect(await uiEditorRowOrder(page)).toEqual([...TASKS_PRESET_COLUMNS, ...SCHEMA_ONLY_COLUMNS]);
        expect(await gridHeaderOrder(page)).toEqual(TASKS_PRESET_COLUMNS);

        // Drop "priority" on the top half of "title" so it lands before it.
        await dragUiEditorRow(page, "priority", "title", "above");

        const reordered = ["id", "priority", "title", "status", "due_date", "repeat_days"];
        await expect.poll(() => uiEditorRowOrder(page), { timeout: 15000 })
            .toEqual([...reordered, ...SCHEMA_ONLY_COLUMNS]);
        await expect.poll(() => gridHeaderOrder(page), { timeout: 15000 }).toEqual(reordered);
    });

    test("a reorder made in the grid shows up in the editor row list", async ({ page }) => {
        // Drop "due_date" on the right half of "repeat_days" (the last column).
        await dragColumnHeader(page, "due_date", "repeat_days", "right");

        const reordered = ["id", "title", "status", "priority", "repeat_days", "due_date"];
        await expect.poll(() => gridHeaderOrder(page), { timeout: 15000 }).toEqual(reordered);
        // Columns the query does not return keep trailing the stored order.
        await expect.poll(() => uiEditorRowOrder(page), { timeout: 15000 })
            .toEqual([...reordered, ...SCHEMA_ONLY_COLUMNS]);
    });

    test("dragging an editor row does not move the outliner item hosting the table", async ({ page }) => {
        const itemIdsBefore = await page.locator(".outliner-item[data-item-id]")
            .evaluateAll((items) => items.map((i) => i.getAttribute("data-item-id") ?? ""));

        await dragUiEditorRow(page, "completed_at", "id", "above");

        await expect.poll(() => uiEditorRowOrder(page), { timeout: 15000 })
            .toEqual(["completed_at", ...TASKS_PRESET_COLUMNS, "created_at"]);

        const itemIdsAfter = await page.locator(".outliner-item[data-item-id]")
            .evaluateAll((items) => items.map((i) => i.getAttribute("data-item-id") ?? ""));
        expect(itemIdsAfter).toEqual(itemIdsBefore);
    });
});
