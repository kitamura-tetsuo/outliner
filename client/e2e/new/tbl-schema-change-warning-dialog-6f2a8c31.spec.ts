import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
/** @feature FTR-53f59906
 *  Title   : Yjs + PGlite database tables
 *  Source  : docs/client-features/tbl-yjs-pglite-database-tables-53f59906.yaml
 */
import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

test.describe("FTR-53f59906: schema-change destructive warning dialog", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        test.setTimeout(120000);
        await TestHelpers.seedProjectAndNavigate(page, testInfo, ["Database table demo item"]);
    });

    async function createBlankTable(page: import("@playwright/test").Page) {
        await expect(page.locator(".outliner-item").first()).toBeVisible({ timeout: 10000 });
        await page.locator(".outliner-item").first().click();
        await page.waitForTimeout(300);

        const addDatabaseBtn = page.getByTestId("main-toolbar").locator(".add-database-btn").last();
        await expect(addDatabaseBtn).toBeVisible({ timeout: 10000 });
        await addDatabaseBtn.click();

        const createPanel = page.getByTestId("yjs-table-create-panel").first();
        await expect(createPanel).toBeVisible({ timeout: 10000 });
        await page.getByTestId("yjs-table-preset-select").first().selectOption("blank");
        await page.getByTestId("yjs-table-create").first().click();

        const view = page.getByTestId("yjs-table-view").first();
        await expect(view).toBeVisible({ timeout: 15000 });
        const grid = page.getByTestId("yjs-table-grid").first();
        await expect(grid.locator("th", { hasText: "title" })).toBeVisible({ timeout: 30000 });
        await expect(grid.locator("th", { hasText: "done" })).toBeVisible();

        // Open the schema editor
        await page.getByTestId("yjs-table-toggle-schema").first().click();
        const editor = page.getByTestId("yjs-table-schema-editor").first();
        await expect(editor).toBeVisible({ timeout: 10000 });
        return editor;
    }

    test("removing a column shows the destructive-change warning and cancel keeps the schema", async ({ page }) => {
        const editor = await createBlankTable(page);
        const grid = page.getByTestId("yjs-table-grid").first();

        const textarea = editor.getByTestId("yjs-table-schema-input");
        await textarea.fill(
            "CREATE TABLE items (\n  id TEXT PRIMARY KEY,\n  title TEXT NOT NULL\n)",
        );
        await editor.getByTestId("yjs-table-schema-apply").click();

        const warning = editor.getByTestId("yjs-table-schema-warning");
        await expect(warning).toBeVisible({ timeout: 20000 });
        await expect(warning).toContainText("Columns removed");
        await expect(warning).toContainText("done");

        // Cancel: the warning disappears and the "done" column stays in the grid.
        await editor.getByTestId("yjs-table-schema-cancel").click();
        await expect(warning).toBeHidden();
        await expect(grid.locator("th", { hasText: "done" })).toBeVisible({ timeout: 10000 });
    });

    test("confirming the destructive change applies the schema and drops the column", async ({ page }) => {
        const editor = await createBlankTable(page);

        const textarea = editor.getByTestId("yjs-table-schema-input");
        await textarea.fill(
            "CREATE TABLE items (\n  id TEXT PRIMARY KEY,\n  title TEXT NOT NULL\n)",
        );
        await editor.getByTestId("yjs-table-schema-apply").click();

        const warning = editor.getByTestId("yjs-table-schema-warning");
        await expect(warning).toBeVisible({ timeout: 20000 });

        await editor.getByTestId("yjs-table-schema-confirm").click();
        await expect(warning).toBeHidden({ timeout: 10000 });

        // The stale UI query still selects the removed "done" column, so it
        // now fails against the applied schema -- proof the schema change
        // (not just the dialog) actually took effect.
        await expect(page.getByTestId("yjs-table-query-error")).toBeVisible({ timeout: 15000 });
        await expect(page.getByTestId("yjs-table-query-error")).toContainText("done");

        // The schema text itself reflects the applied (destructive) change.
        const schemaValue = await editor.getByTestId("yjs-table-schema-input").inputValue();
        expect(schemaValue).not.toContain("done");
    });
});
