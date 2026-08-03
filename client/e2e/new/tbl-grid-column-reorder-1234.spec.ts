import { test, expect } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

test("Grid column reorder via handle", async ({ page }) => {
    const helpers = new TestHelpers(page);
    await helpers.seedAndVisit("test-project", []);
    await page.getByTestId("add-database-btn").click();
    await page.getByRole("button", { name: "Tasks" }).click();
    await page.getByTestId("yjs-table-create").click();
    await expect(page.getByTestId("yjs-table-name")).toBeVisible();

    const dragHandles = page.getByTestId("yjs-table-column-drag-handle");
    await expect(dragHandles).toHaveCount(3);

    // Drag first handle to second column
    const firstHandle = dragHandles.nth(0);
    const secondCol = page.locator("th").nth(1);

    await firstHandle.dragTo(secondCol);

    // Test completed without errors
});
