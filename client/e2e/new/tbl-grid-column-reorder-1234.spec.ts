import { expect, test } from "@playwright/test";
import { dragColumnHeader, TASKS_PRESET_COLUMNS } from "../utils/tableColumnDragHelpers";
import { TestHelpers } from "../utils/testHelpers";

test("Grid column reorder via handle", async ({ page }, testInfo) => {
    await TestHelpers.seedProjectAndNavigate(page, testInfo, ["Empty Item"]);
    const itemId = await TestHelpers.getItemIdByIndex(page, 0);
    const item = page.locator(`.outliner-item[data-item-id="${itemId}"]`);
    await item.click();
    await page.waitForTimeout(300);
    const addDatabaseBtn = page.getByTestId("main-toolbar").locator(".add-database-btn").last();
    await expect(addDatabaseBtn).toBeVisible({ timeout: 10000 });
    await addDatabaseBtn.click();
    await page.getByTestId("yjs-table-preset-select").first().selectOption("tasks");
    await page.getByTestId("yjs-table-create").click();
    await expect(page.getByTestId("yjs-table-name")).toBeVisible();

    const dragHandles = page.getByTestId("yjs-table-column-drag-handle");
    await expect(dragHandles).toHaveCount(6);

    // Initial order is: ["id", "title", "status", "priority", "due_date", "repeat_days"]
    // We drag "id" onto the right side of "title".
    await dragColumnHeader(page, "id", "title", "right");

    // Verify order changed
    const expectedOrder = ["title", "id", "status", "priority", "due_date", "repeat_days"];
    const actualOrder = await page.getByTestId("yjs-table-grid").first().locator("th[data-col]").evaluateAll((ths) =>
        ths.map((th) => th.getAttribute("data-col") ?? "")
    );
    expect(actualOrder).toEqual(expectedOrder);
});
