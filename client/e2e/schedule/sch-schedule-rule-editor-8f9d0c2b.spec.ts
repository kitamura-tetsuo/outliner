import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";
import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();

test.describe("Schedule Rule Editor UI", () => {
    test("Create rule via preset form", async ({ page }) => {
        await TestHelpers.seedProjectAndNavigate(page, null, ["Test Table Item"]);

        await expect(page.locator(".outliner-item").first()).toBeVisible({ timeout: 10000 });
        await page.locator(".outliner-item").first().click();
        await page.waitForTimeout(300);

        // Insert a Database block from the toolbar
        const addDatabaseBtn = page.getByTestId("main-toolbar").locator(".add-database-btn").last();
        await expect(addDatabaseBtn).toBeVisible({ timeout: 10000 });
        await addDatabaseBtn.click();

        // The create panel appears; create a table from the Tasks preset
        const createPanel = page.getByTestId("yjs-table-create-panel").first();
        await expect(createPanel).toBeVisible({ timeout: 10000 });
        await page.getByTestId("yjs-table-preset-select").first().selectOption("tasks");
        await page.getByTestId("yjs-table-create").first().click();

        await page.waitForSelector("[data-testid=yjs-table-view]");
        // tableNameText not needed
        // tableName parsed but unused in local UI flow

        // Open the schedule panel from the table view
        const scheduleToggle = page.getByTestId("yjs-table-toggle-schedule");
        await expect(scheduleToggle).toBeVisible({ timeout: 10000 });
        await scheduleToggle.click();

        // Verify the schedule panel is visible
        const schedulePanel = page.getByTestId("yjs-table-schedule-panel");
        await expect(schedulePanel).toBeVisible({ timeout: 10000 });

        // Click "+ New Rule"
        const addBtn = page.getByTestId("schedule-rule-add");
        await expect(addBtn).toBeVisible({ timeout: 10000 });
        await addBtn.click();

        // Verify the editor opened by checking for the Save button
        await expect(page.locator("button:has-text('Save')")).toBeVisible({ timeout: 10000 });
    });
});
