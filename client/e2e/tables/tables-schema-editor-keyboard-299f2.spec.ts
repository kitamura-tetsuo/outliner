import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

test.describe("Table schema editor keyboard handling", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        // Seed a project with a single table container item
        await TestHelpers.seedProjectAndNavigate(page, testInfo, ["Table container"]);

        // Wait for connection to settle
        await page.waitForTimeout(500);

        await expect(page.locator(".outliner-item").first()).toBeVisible({ timeout: 10000 });
        await page.locator(".outliner-item").first().click();
        await page.waitForTimeout(300);

        // Insert a Database block from the toolbar
        const addDatabaseBtn = page.getByTestId("main-toolbar").locator(".add-database-btn").last();
        await expect(addDatabaseBtn).toBeVisible({ timeout: 10000 });
        await addDatabaseBtn.click();

        // The create panel appears; create an empty table
        const createPanel = page.getByTestId("yjs-table-create-panel").first();
        await expect(createPanel).toBeVisible({ timeout: 10000 });
        await page.getByTestId("yjs-table-create").first().click();

        // Wait for the view to mount
        const view = page.getByTestId("yjs-table-view").first();
        await expect(view).toBeVisible({ timeout: 15000 });

        // Wait for the grid container to appear
        await expect(view.locator(".yjs-table-container")).toBeVisible({ timeout: 15000 }).catch(() => {});

        // Open the schema panel explicitly via the panel control button
        const toggleBtn = view.locator('[data-testid="yjs-table-toggle-schema"]');
        if (await toggleBtn.count() > 0) {
            await toggleBtn.first().click();
        }

        // Wait for the schema editor to appear
        await page.locator('[data-testid="yjs-table-schema-input"]').waitFor({ state: "visible", timeout: 15000 });
    });

    test("Enter key inserts newline in schema editor and retains focus", async ({ page }) => {
        const schemaApplyButton = page.locator('[data-testid="yjs-table-schema-apply"]');
        const schemaTextarea = page.locator('[data-testid="yjs-table-schema-input"]');

        // Select all text in the textarea and delete it
        await schemaTextarea.focus();
        await expect(schemaTextarea).toBeFocused();
        await page.keyboard.press("Meta+A"); // or Ctrl+A, but Playwright handles modifier cross-platform best by explicit clear
        await schemaTextarea.fill(""); // simpler than Meta+A

        // Type a multiline CREATE TABLE statement
        const createStatement1 = "CREATE TABLE test_table (";
        await page.keyboard.type(createStatement1);
        await page.keyboard.press("Enter");
        const createStatement2 = "  id INTEGER PRIMARY KEY,";
        await page.keyboard.type(createStatement2);
        await page.keyboard.press("Enter");
        const createStatement3 = "  name TEXT";
        await page.keyboard.type(createStatement3);
        await page.keyboard.press("Enter");
        const createStatement4 = ");";
        await page.keyboard.type(createStatement4);

        // Verify focus is still in the textarea, not the outliner item
        await expect(schemaTextarea).toBeFocused();

        // Verify the content has the expected newlines
        const value = await schemaTextarea.inputValue();
        expect(value).toBe(`${createStatement1}\n${createStatement2}\n${createStatement3}\n${createStatement4}`);

        // Click apply schema
        await schemaApplyButton.click();

        // Check for applying error
        await expect(page.getByTestId("yjs-table-schema-error")).not.toBeVisible();

        // We are editing an existing schema (from the empty table template) which might trigger a warning if we replaced it entirely
        // Click confirm if the warning dialog appears
        const confirmBtn = page.getByTestId("yjs-table-schema-confirm");
        try {
            await expect(confirmBtn).toBeVisible({ timeout: 5000 });
            await confirmBtn.click();
            await expect(page.getByTestId("yjs-table-schema-error")).not.toBeVisible();
        } catch (_e) {
            // It's fine if the warning doesn't appear
        }

        // Wait for the applying state to clear
        await expect(schemaApplyButton).toHaveText("Apply schema");

        // Explicitly set the query to ensure we get results back and the grid renders columns
        await page.getByTestId("yjs-table-toggle-ui").first().click();
        await expect(page.locator('[data-testid="yjs-table-ui-editor"]')).toBeVisible({ timeout: 15000 });

        const queryInput = page.locator('[data-testid="yjs-table-query-input"]');
        await queryInput.fill("SELECT * FROM test_table");
        await queryInput.press("Enter");

        // Check that the grid columns updated
        const grid = page.getByTestId("yjs-table-grid").first();
        await expect(grid.locator("th[data-col='id']")).toBeVisible({ timeout: 30000 });
        await expect(grid.locator("th[data-col='name']")).toBeVisible({ timeout: 30000 });
    });
});
