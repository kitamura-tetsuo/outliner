/**
 * @feature TBL-af13f577
 */

import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

test.describe("Table Grid Header Labeling", () => {
    test(
        "Setting a label overrides the header text but leaves data-col as the SQL name",
        async ({ page }, testInfo) => {
            const { projectName, pageName } = await TestHelpers.seedProjectAndNavigate(page, testInfo, [
                "Table testing item",
            ]);

            await expect(page.locator(".outliner-item").first()).toBeVisible({ timeout: 10000 });
            await page.locator(".outliner-item").first().click();
            await page.waitForTimeout(300);

            // Insert a Database block from the toolbar
            const addDatabaseBtn = page.getByTestId("main-toolbar").locator(".add-database-btn").last();
            await expect(addDatabaseBtn).toBeVisible({ timeout: 10000 });
            await addDatabaseBtn.click();

            // Create table from Tasks preset for simplicity
            const createPanel = page.getByTestId("yjs-table-create-panel").first();
            await expect(createPanel).toBeVisible({ timeout: 10000 });
            await page.getByTestId("yjs-table-preset-select").first().selectOption("tasks");
            await page.getByTestId("yjs-table-create").first().click();

            // Wait for table to load
            const gridBlock = page.locator("[data-testid='yjs-table-view']").first();
            await expect(gridBlock).toBeVisible();

            // Assert initial state: header text is due_date
            const header = gridBlock.locator("th[data-col='due_date'] .th-label");
            await expect(header).toHaveText("due_date", { timeout: 15000 });

            // Toggle UI definition editor
            const uiToggle = gridBlock.locator("[data-testid='yjs-table-toggle-ui']");
            await uiToggle.click();

            // Enter a label
            const labelInput = gridBlock.locator("[data-testid='yjs-table-label-due_date']");
            await expect(labelInput).toBeVisible();
            await labelInput.fill("Target Date");
            await labelInput.evaluate((e) => e.blur()); // trigger change event

            // Assert header text updated
            await expect(header).toHaveText("Target Date");

            // The data-col attribute and the original SQL name title should still exist on the th
            const thElement = gridBlock.locator("th[data-col='due_date']");
            await expect(thElement).toHaveAttribute("title", "due_date");

            // Reload to verify persistence
            await page.reload();

            const reloadedGridBlock = page.locator("[data-testid='yjs-table-view']");
            await expect(reloadedGridBlock).toBeVisible();

            const reloadedHeader = reloadedGridBlock.locator("th[data-col='due_date'] .th-label");
            await expect(reloadedHeader).toHaveText("Target Date", { timeout: 15000 });

            const reloadedTh = reloadedGridBlock.locator("th[data-col='due_date']");
            await expect(reloadedTh).toHaveAttribute("title", "due_date");
        },
    );
});
