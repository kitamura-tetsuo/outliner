import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
import { expect, test } from "../fixtures/grid-render-trace";
import { SqlEditorHelper } from "../utils/sqlEditorHelpers";
import { TestHelpers } from "../utils/testHelpers";

// Monaco owns the clipboard while it has focus: a paste inside the SQL editor
// must replace the selected SQL, not travel on to the outline paste path (which
// would create sibling items out of the pasted text).
test.describe("Grid Schema Editor Paste", () => {
    test("handles paste inside the SQL editor without intercepting outliner items", async ({ page }, testInfo) => {
        test.setTimeout(120000);
        await TestHelpers.seedProjectAndNavigate(page, testInfo, ["Table container"]);

        await expect(page.locator(".outliner-item").first()).toBeVisible({ timeout: 10000 });
        await page.locator(".outliner-item").first().click();

        // Insert a Database block from the toolbar and create an empty table.
        const addDatabaseBtn = page.getByTestId("main-toolbar").locator(".add-database-btn").last();
        await expect(addDatabaseBtn).toBeVisible({ timeout: 10000 });
        await addDatabaseBtn.click();
        await expect(page.getByTestId("yjs-table-create-panel").first()).toBeVisible({ timeout: 10000 });
        await page.getByTestId("yjs-table-create").first().click();

        const view = page.getByTestId("yjs-table-view").first();
        await expect(view).toBeVisible({ timeout: 15000 });
        await view.getByTestId("yjs-table-toggle-schema").click();

        const schemaEditor = new SqlEditorHelper(view.getByTestId("yjs-table-schema-input"));
        await schemaEditor.waitForReady();
        const itemCountBefore = await page.locator(".outliner-item[data-item-id]").count();

        await schemaEditor.setValue(page, "CREATE TABLE test (id TEXT PRIMARY KEY)");

        // Put "pasted_table" on the real system clipboard.
        await page.evaluate(() => {
            const tempInput = document.createElement("textarea");
            tempInput.id = "clipboard-test";
            document.body.appendChild(tempInput);
        });
        const helper = page.locator("#clipboard-test");
        await helper.fill("pasted_table");
        await helper.focus();
        await helper.selectText();
        await page.keyboard.press("ControlOrMeta+C");

        // Select the table name inside the SQL editor and paste over it.
        await schemaEditor.focus();
        await page.keyboard.press("Home");
        for (let i = 0; i < "CREATE TABLE ".length; i++) await page.keyboard.press("ArrowRight");
        for (let i = 0; i < "test".length; i++) await page.keyboard.press("Shift+ArrowRight");
        await page.keyboard.press("ControlOrMeta+V");

        await expect
            .poll(async () => await schemaEditor.value(), { timeout: 15000 })
            .toBe("CREATE TABLE pasted_table (id TEXT PRIMARY KEY)");

        // Focus stayed in the editor and the outline is untouched.
        expect(await schemaEditor.hasFocus()).toBe(true);
        expect(await page.locator(".outliner-item[data-item-id]").count()).toBe(itemCountBefore);
    });
});
