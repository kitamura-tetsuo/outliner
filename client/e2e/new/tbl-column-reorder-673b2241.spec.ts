import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
/** @feature TBL-673b2241
 *  Title   : Table column reordering
 *  Source  : docs/client-features/tbl-column-reorder-673b2241.yaml
 *
 *  Dragging a column header in the grid. The UI Definition editor drag lives in
 *  tbl-column-reorder-ui-editor-673b2241.spec.ts.
 */
import { expect, test } from "@playwright/test";
import {
    createTasksTableBlock,
    dragColumnHeader,
    gridFirstRowCellOrder,
    gridHeaderOrder,
    TASKS_PRESET_COLUMNS,
    waitForGridColumns,
} from "../utils/tableColumnDragHelpers";
import { TestHelpers } from "../utils/testHelpers";

test.describe("TBL-673b2241: reordering columns by dragging grid headers", () => {
    /** The seeded item the table block is attached to, addressed by `data-item-id`. */
    let hostItemId: string;

    test.beforeEach(async ({ page }, testInfo) => {
        test.setTimeout(120000);
        await TestHelpers.seedProjectAndNavigate(page, testInfo, ["Table host item", "Neighbour item"]);
        await TestHelpers.waitForOutlinerItems(page, 3, 10000); // Title + 2 seeded items
        hostItemId = await TestHelpers.getItemIdByIndex(page, 1);
    });

    test("dragging a header via real mouse interactions moves the column and persists the order across a reload", async ({ page }) => {
        await createTasksTableBlock(page, hostItemId);

        expect(await gridHeaderOrder(page)).toEqual(TASKS_PRESET_COLUMNS);

        // REAL MOUSE DRAG
        const sourceHeader = page.locator("th[data-col='status'] .column-drag-handle").first();
        const targetHeader = page.locator("th[data-col='title']").first();

        const targetBox = await targetHeader.boundingBox();
        if (targetBox) {
            await sourceHeader.dragTo(page.locator("body"), {
                targetPosition: {
                    x: targetBox.x + 5,
                    y: targetBox.y + targetBox.height / 2
                }
            });
        } else {
            throw new Error("Target bounding box not found");
        }

        const reordered = ["id", "status", "title", "priority", "due_date", "repeat_days"];
        await expect.poll(() => gridHeaderOrder(page), { timeout: 15000 }).toEqual(reordered);

        // Header cells and body cells move together.
        await page.getByTestId("yjs-table-add-row").first().click();
        await expect(page.getByTestId("yjs-table-grid").first().locator("tbody tr").first())
            .toBeVisible({ timeout: 15000 });
        await expect.poll(() => gridFirstRowCellOrder(page), { timeout: 15000 }).toEqual(reordered);

        // The order lives in the UI Definition, so it survives a reload.
        await page.reload();
        await waitForGridColumns(page);
        await expect.poll(() => gridHeaderOrder(page), { timeout: 30000 }).toEqual(reordered);
    });

    test("dragging a header (using synthetic helper) moves the column", async ({ page }) => {
        await createTasksTableBlock(page, hostItemId);

        expect(await gridHeaderOrder(page)).toEqual(TASKS_PRESET_COLUMNS);

        // Drop "status" on the left half of "title" so it lands before it.
        await dragColumnHeader(page, "status", "title", "left");

        const reordered = ["id", "status", "title", "priority", "due_date", "repeat_days"];
        await expect.poll(() => gridHeaderOrder(page), { timeout: 15000 }).toEqual(reordered);

        // Header cells and body cells move together.
        await page.getByTestId("yjs-table-add-row").first().click();
        await expect(page.getByTestId("yjs-table-grid").first().locator("tbody tr").first())
            .toBeVisible({ timeout: 15000 });
        await expect.poll(() => gridFirstRowCellOrder(page), { timeout: 15000 }).toEqual(reordered);

        // The order lives in the UI Definition, so it survives a reload.
        await page.reload();
        await waitForGridColumns(page);
        await expect.poll(() => gridHeaderOrder(page), { timeout: 30000 }).toEqual(reordered);
    });

    test("dragging a header does not move the outliner item hosting the table", async ({ page }) => {
        await createTasksTableBlock(page, hostItemId);

        const itemIdsBefore = await page.locator(".outliner-item[data-item-id]")
            .evaluateAll((items) => items.map((i) => i.getAttribute("data-item-id") ?? ""));

        // Drop "priority" onto the right half of "repeat_days" (the last column):
        // the gesture crosses the whole table width inside the outliner item.
        await dragColumnHeader(page, "priority", "repeat_days", "right");

        await expect.poll(() => gridHeaderOrder(page), { timeout: 15000 })
            .toEqual(["id", "title", "status", "due_date", "repeat_days", "priority"]);

        // The outliner item order is untouched and no item drop indicator was shown.
        const itemIdsAfter = await page.locator(".outliner-item[data-item-id]")
            .evaluateAll((items) => items.map((i) => i.getAttribute("data-item-id") ?? ""));
        expect(itemIdsAfter).toEqual(itemIdsBefore);
        const dropIndicators = ".item-content.drop-target-top, .item-content.drop-target-bottom, "
            + ".item-content.drop-target-middle";
        await expect(page.locator(dropIndicators)).toHaveCount(0);
    });

    test("Alt+Arrow on a focused header moves that column", async ({ page }) => {
        await createTasksTableBlock(page, hostItemId);

        const header = page.getByTestId("yjs-table-grid").first().locator("th[data-col='status']");
        await header.focus();
        await page.keyboard.press("Alt+ArrowLeft");

        await expect.poll(() => gridHeaderOrder(page), { timeout: 15000 })
            .toEqual(["id", "status", "title", "priority", "due_date", "repeat_days"]);
    });
});
