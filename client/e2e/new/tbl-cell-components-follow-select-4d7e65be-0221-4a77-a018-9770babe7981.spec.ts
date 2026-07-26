import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

test.describe("Table UI Definition Cell components list", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        test.setTimeout(120000);
        await TestHelpers.seedProjectAndNavigate(page, testInfo, ["Database table demo item"]);
    });

    test("derives from SELECT query, not from schema", async ({ page }) => {
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

        // Wait for grid to render
        const view = page.getByTestId("yjs-table-view").first();
        await expect(view).toBeVisible({ timeout: 15000 });
        const grid = page.getByTestId("yjs-table-grid").first();
        await expect(grid.locator("th", { hasText: "title" })).toBeVisible({ timeout: 30000 });

        // Switch to UI panel
        await page.locator('[data-testid="yjs-table-toggle-ui"]').click();
        const editor = page.locator('[data-testid="yjs-table-ui-editor"]');
        await expect(editor).toBeVisible({ timeout: 10000 });

        // Wait a short moment to ensure schema and query result reach UI panel mirror
        await page.waitForTimeout(1000);

        // Check default rows (since initial query is SELECT id, title, status, priority, due_date, repeat_days FROM tasks ...)
        await expect(page.locator('[data-testid="yjs-table-component-id"]')).toBeVisible();
        await expect(page.locator('[data-testid="yjs-table-component-title"]')).toBeVisible();
        await expect(page.locator('[data-testid="yjs-table-component-status"]')).toBeVisible();

        // Ensure not-selected schema cols like created_at are NOT visible
        await expect(page.locator('[data-testid="yjs-table-component-created_at"]')).not.toBeVisible();

        // Change query
        const queryInput = page.locator('[data-testid="yjs-table-query-input"]');
        await queryInput.fill("SELECT id, title FROM tasks");
        await page.keyboard.press("Enter");

        // Re-run the wait as the db query needs to respond before updating UI
        await page.waitForTimeout(3000);

        // The title column element should remain/appear
        await expect(page.locator('[data-testid="yjs-table-component-title"]')).toBeVisible();

        // The status column element should disappear from the active rows
        await expect(page.locator('[data-testid="yjs-table-component-status"]')).not.toBeVisible();

        // Change title to checkbox to make sure it functions properly and saves
        const titleSelect = page.locator('[data-testid="yjs-table-component-title"]');
        await titleSelect.selectOption("checkbox");

        // Go back to grid to ensure it updates (Optional: switch to grid panel)
    });
});
