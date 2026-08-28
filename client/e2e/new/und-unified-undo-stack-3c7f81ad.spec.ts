import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
/** @feature FTR-3c7f81ad
 *  Title   : Unified undo stack across scopes
 *  Source  : docs/client-features/und-unified-undo-stack-3c7f81ad.yaml
 */
import { expect, test } from "../fixtures/grid-render-trace";
import { TestHelpers } from "../utils/testHelpers";

/**
 * An edit in the outline followed by an edit in a table must undo in strict
 * reverse chronological order, even though the two live in different Y.Docs
 * with their own Y.UndoManager.
 */
test.describe("FTR-3c7f81ad: unified undo stack across the outline and tables", () => {
    test("undoes a table edit then an outline edit, in reverse order", async ({ page }, testInfo) => {
        test.setTimeout(120000);
        await TestHelpers.seedProjectAndNavigate(page, testInfo, ["Undo order source item"]);

        const firstItem = page.locator(".outliner-item").first();
        await expect(firstItem).toBeVisible({ timeout: 10000 });
        await firstItem.click();
        await page.waitForTimeout(300);

        // A table block, so a second undo scope exists on the page.
        const addDatabaseBtn = page.getByTestId("main-toolbar").locator(".add-database-btn").last();
        await expect(addDatabaseBtn).toBeVisible({ timeout: 10000 });
        await addDatabaseBtn.click();

        const createPanel = page.getByTestId("yjs-table-create-panel").first();
        await expect(createPanel).toBeVisible({ timeout: 10000 });
        await page.getByTestId("yjs-table-preset-select").first().selectOption("tasks");
        await page.getByTestId("yjs-table-create").first().click();

        const tableView = page.getByTestId("yjs-table-view").first();
        await expect(tableView).toBeVisible({ timeout: 15000 });

        const rows = page.getByTestId("yjs-table-grid").first().locator("tbody tr[data-record-id]");
        const initialRowCount = await rows.count();

        // Operation 1 (older): an outline edit.
        const itemText = page.locator(".outliner-item").first().locator(".item-text").first();
        await itemText.click();
        await page.waitForTimeout(300);
        await page.keyboard.press("End");
        await page.keyboard.type(" EDITED");
        await expect(page.locator(".outliner-item").first()).toContainText("EDITED", { timeout: 10000 });

        // Operation 2 (newer): a table edit in a different Y.Doc.
        await page.getByTestId("yjs-table-add-row").first().click();
        await expect(rows).toHaveCount(initialRowCount + 1, { timeout: 15000 });

        // First undo reverses the newest operation only: the added row goes, the
        // outline edit stays.
        await itemText.click();
        await page.waitForTimeout(300);
        await page.keyboard.press("Control+z");
        await expect(rows).toHaveCount(initialRowCount, { timeout: 15000 });
        await expect(page.locator(".outliner-item").first()).toContainText("EDITED");

        // Second undo reaches back into the other scope and reverses the outline edit.
        await page.keyboard.press("Control+z");
        await expect(page.locator(".outliner-item").first()).not.toContainText("EDITED", {
            timeout: 10000,
        });
        await expect(rows).toHaveCount(initialRowCount);
    });
});
