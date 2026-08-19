import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

test.describe("Table schema editor keyboard handling", () => {
    let projectInfo: { projectId: string; projectName: string; pageName: string; };

    test.beforeEach(async ({ page }, testInfo) => {
        // Seed a project with a single table container item
        projectInfo = await TestHelpers.seedProjectAndNavigate(page, testInfo, ["Table container"]);

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
        const toggleBtn = view.locator('[data-testid="yjs-table-toggle-schema-btn"]');
        if (await toggleBtn.count() > 0) {
            await toggleBtn.first().click();
        }

        // Wait for the schema editor to appear
        await page.locator('[data-testid="yjs-table-schema-input"]').waitFor({ state: "visible", timeout: 15000 });
    });

    test("Enter key inserts newline in schema editor and retains focus", async ({ page }) => {
        const schemaApplyButton = page.locator('[data-testid="yjs-table-schema-apply"]');
        const schemaTextarea = page.locator('[data-testid="yjs-table-schema-input"]');

        // Focus the schema textarea
        await schemaTextarea.focus();
        await expect(schemaTextarea).toBeFocused();

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

        // Verify that the table UI def editor is NOT visible yet (table has no columns)
        await expect(page.locator('[data-testid="yjs-table-ui-editor"]')).not.toBeVisible();

        // Click apply schema
        await schemaApplyButton.click();

        // Wait for the applying state to clear
        await expect(schemaApplyButton).toHaveText("Apply schema");

        // UI definition editor should now appear with our columns
        await expect(page.locator('[data-testid="yjs-table-ui-editor"]')).toBeVisible();

        // Check that the columns were successfully applied
        await expect(page.locator('.component-row[data-col="id"]')).toBeVisible();
        await expect(page.locator('.component-row[data-col="name"]')).toBeVisible();
    });
});
