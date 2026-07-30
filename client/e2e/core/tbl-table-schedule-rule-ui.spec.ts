/** @feature TBL-3950a1b2 */
import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

test.describe("Table Schedule Rule UI", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        await TestHelpers.seedProjectAndNavigate(page, testInfo);
    });

    test("should display schedule toggle and allow creating schedule rules", async ({ page }) => {
        // Find an item to add a table to
        const item = page.locator(".outliner-item").last();
        await item.locator(".item-content").click({ force: true });

        // Use TestHelpers to insert a table block
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

        // Find and click the Schedule toggle
        const scheduleToggle = tableBlock.locator("[data-testid='yjs-table-toggle-schedule']");
        await expect(scheduleToggle).toBeVisible();
        await scheduleToggle.click();

        // Check if Schedule Panel appears
        const schedulePanel = tableBlock.locator("[data-testid='yjs-table-schedule-panel']");
        await expect(schedulePanel).toBeVisible();

        // Find "+ New Rule" button and click it
        const newRuleBtn = schedulePanel.locator("[data-testid='yjs-table-schedule-create']");
        await expect(newRuleBtn).toBeVisible();
        await newRuleBtn.click();

        // Check if editor appears
        await expect(schedulePanel.locator("text=SQL Statement")).toBeVisible();

        // Create rule
        const saveBtn = schedulePanel.locator("button:has-text('Save')");
        await expect(saveBtn).toBeVisible();
        await saveBtn.click();

        // Check if rule is in the list
        await expect(schedulePanel.locator("text=every day")).toBeVisible();

        // Edit rule
        const editBtn = schedulePanel.locator("button:has-text('Edit')").first();
        await editBtn.click();
        await expect(schedulePanel.locator("text=SQL Statement")).toBeVisible();

        const cancelBtn = schedulePanel.locator("button:has-text('Cancel')");
        await cancelBtn.click();

        // Delete rule
        page.on("dialog", dialog => dialog.accept());
        const deleteBtn = schedulePanel.locator("button:has-text('Delete')").first();
        await deleteBtn.click();

        // Verify deletion
        await expect(schedulePanel.locator("text=No schedule rules defined")).toBeVisible();
    });
});
