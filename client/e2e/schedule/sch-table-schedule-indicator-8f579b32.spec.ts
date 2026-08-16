import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

test.describe("sch-table-schedule-indicator-8f579b32", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        await TestHelpers.seedProjectAndNavigate(page, testInfo);
    });

    test("should show schedule indicator based on table rules", async ({ page }) => {
        // Find an item to add a table to
        const item = page.locator(".outliner-item").last();
        await item.locator(".item-content").click({ force: true });

        // Insert a Database block from the toolbar
        const addDatabaseBtn = page.locator(".add-database-btn").first();
        await expect(addDatabaseBtn).toBeVisible({ timeout: 10000 });
        await addDatabaseBtn.click();

        // Wait for table to appear
        const tableBlock = page.locator("[data-testid='yjs-table-block']").first();
        await expect(tableBlock).toBeVisible();

        // Wait for new table form to appear
        await page.waitForSelector("[data-testid='yjs-table-create-panel']");
        await page.click("[data-testid='yjs-table-create']");

        // Wait for the grid to appear, meaning adapter is ready
        await expect(tableBlock.locator("[data-testid='yjs-table-toggle-grid']")).toBeVisible();

        const tableView = page.getByTestId("yjs-table-view");
        await expect(tableView).toBeVisible();

        const scheduleToggle = page.getByTestId("yjs-table-toggle-schedule");
        const scheduleIndicator = page.getByTestId("yjs-table-schedule-indicator");

        // 1. Assert no indicator initially
        await expect(scheduleIndicator).toHaveCount(0);

        // 2. Create a schedule rule for the table
        await scheduleToggle.click();
        const schedulePanel = page.getByTestId("yjs-table-schedule-panel");
        // We wait for the panel to appear
        await expect(schedulePanel).toBeVisible();

        // Click Add Rule button
        await page.getByTestId("yjs-table-schedule-create").click();

        // Editor appears, just Save with defaults
        const saveBtn = schedulePanel.locator("button:has-text('Save')");
        await expect(saveBtn).toBeVisible();
        await saveBtn.click();

        // 3. Assert data-schedule-state="enabled"
        await expect(scheduleIndicator).toBeVisible();
        await expect(scheduleIndicator).toHaveAttribute("data-schedule-state", "enabled");

        // 4. Disable it
        const editButton = schedulePanel.locator("button:has-text('Edit')").first();
        await editButton.click();

        // Find enabled checkbox
        const enabledLabel = schedulePanel.locator("label").filter({ hasText: "Enabled" });
        await enabledLabel.locator("input[type='checkbox']").uncheck();

        await schedulePanel.locator("button:has-text('Save')").click();

        // Assert data-schedule-state="disabled"
        await expect(scheduleIndicator).toHaveAttribute("data-schedule-state", "disabled");

        // 5. Delete it
        page.on("dialog", dialog => dialog.accept());
        const deleteButton = schedulePanel.locator("button:has-text('Delete')").first();
        await deleteButton.click();

        // Assert the indicator disappears
        await expect(scheduleIndicator).toHaveCount(0);
    });
});
