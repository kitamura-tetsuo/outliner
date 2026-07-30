/** @feature FTR-e9f8a3c4 */
import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";
import { SeedClient } from "../utils/seedClient";

test.describe("Table column display names", () => {
    test.beforeEach(async ({ page }) => {
        test.setTimeout(120000);
        // Mock clipboard APIs to prevent permissions dialogs in Safari
        await page.addInitScript(() => {
            Object.assign(navigator, {
                clipboard: {
                    writeText: async () => {},
                    readText: async () => "mocked",
                },
            });
        });
    });

    test("configure and persist column display names", async ({ page, context }, testInfo) => {
        const projectId = `test-col-label-${Date.now()}`;
        const pageId = "p-1";

        await TestHelpers.seedProjectDataOnly(page, testInfo, ["Line 1"], {
            projectName: projectId,
            pageName: pageId,
            skipSeed: false
        });

        // Open the page
        await TestHelpers.navigateToProjectPage(page, projectId, pageId, ["Line 1"]);

        // Wait for connection to settle
        await page.waitForTimeout(1000);

        const item = page.locator('.outliner-item:not(.is-title) .item-text').first();
        await expect(item).toBeVisible({ timeout: 10000 });
        await item.click();

        // Insert a Database block from the toolbar
        const addDatabaseBtn = page.getByTestId("main-toolbar").locator(".add-database-btn").last();
        await expect(addDatabaseBtn).toBeVisible({ timeout: 10000 });
        await addDatabaseBtn.click();

        // Use a preset table that already has schema and columns instead of typing it all out manually
        const createPanel = page.getByTestId("yjs-table-create-panel").first();
        await expect(createPanel).toBeVisible({ timeout: 10000 });

        await page.getByTestId("yjs-table-preset-select").first().selectOption("tasks");
        await page.getByTestId("yjs-table-create").first().click();

        // The table should be inserted, wait for grid to be visible
        const grid = page.locator('[data-testid="yjs-table-grid"]');
        await expect(grid).toBeVisible({ timeout: 15000 });

        // Wait for table query to run
        await page.waitForTimeout(2000);

        // Check grid has the expected 'title' column from preset
        const someColHeader = page.locator('th[data-col="title"]');
        await expect(someColHeader).toContainText("title", { timeout: 30000 });

        // 3. Toggle UI definition editor
        await page.click('[data-testid="yjs-table-toggle-ui"]');

        const editor = page.locator('[data-testid="yjs-table-ui-editor"]');
        await expect(editor).toBeVisible();

        // Wait a tiny bit for the components grid to appear in the UI editor
        await page.waitForTimeout(1000);

        // 4. Find the label input and type a new label
        const labelInput = page.locator('[data-testid="yjs-table-label-title"]');
        await expect(labelInput).toBeVisible({ timeout: 10000 });
        await labelInput.fill("Custom Label");
        // Need to simulate a real change event as Playwright .fill() doesn't always trigger it correctly for Svelte
        await labelInput.press('Enter');
        await page.waitForTimeout(500);
        await labelInput.evaluate(node => node.dispatchEvent(new Event('change', { bubbles: true })));
        await page.waitForTimeout(1000);

        // 5. Verify the grid header updated immediately
        await expect(someColHeader).toContainText("Custom Label", { timeout: 10000 });
        // Verify data-col didn't change and title is present
        await expect(someColHeader).toHaveAttribute("data-col", "title");
        await expect(someColHeader).toHaveAttribute("title", "title");

        // 6. Reload and assert persistence
        await page.reload();

        const reloadedGrid = page.locator('[data-testid="yjs-table-grid"]');
        await expect(reloadedGrid).toBeVisible({ timeout: 30000 });

        const reloadedHeader = page.locator('th[data-col="title"]');
        await expect(reloadedHeader).toContainText("Custom Label", { timeout: 10000 });

        // 7. Clear the label and verify fallback
        await page.click('[data-testid="yjs-table-toggle-ui"]');
        const reloadedInput = page.locator('[data-testid="yjs-table-label-title"]');
        await expect(reloadedInput).toBeVisible({ timeout: 10000 });
        await reloadedInput.fill("  "); // empty/spaces
        await reloadedInput.press('Enter');
        await reloadedInput.evaluate(node => node.dispatchEvent(new Event('change', { bubbles: true })));
        await page.waitForTimeout(1000);

        await expect(reloadedHeader).toContainText("title", { timeout: 10000 });
    });
});
