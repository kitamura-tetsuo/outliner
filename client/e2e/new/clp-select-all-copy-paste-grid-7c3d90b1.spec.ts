/** @feature CLP-4584c0de */
import { expect, test } from "@playwright/test";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
import { TestHelpers } from "../utils/testHelpers";
registerCoverageHooks();

test.describe("select all clipboard with component blocks", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        test.setTimeout(120000);
        await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
        await TestHelpers.seedProjectAndNavigate(page, testInfo, ["Alpha", "Block host", "Omega"]);
    });

    test("Ctrl+A copy then paste at the end repeats the Grid block", async ({ page }) => {
        const host = page.locator(".outliner-item").nth(2);
        await expect(host).toBeVisible();
        await host.click();
        const addDatabase = page.getByTestId("main-toolbar").locator(".add-database-btn:not(.undo-redo-btn)").first();
        await addDatabase.click();
        await page.getByTestId("yjs-table-preset-select").first().selectOption("tasks");
        await page.getByTestId("yjs-table-create").first().click();
        await expect(page.getByTestId("yjs-table-view").first()).toBeVisible({ timeout: 30000 });

        // Ctrl+A selects the whole page: every text item plus the Grid host.
        await page.locator(".outliner-item .item-content").first().click();
        await TestHelpers.waitForCursorVisible(page);
        await page.keyboard.press("Control+a");
        await page.keyboard.press("Control+c");
        await expect.poll(() => page.evaluate(() => navigator.clipboard.readText()), { timeout: 15000 })
            .toContain("\nTasks");

        // Move the cursor to the end of the outline, dropping the selection.
        await page.locator(".outliner-item[data-item-id] .item-content").nth(3).click();
        await TestHelpers.waitForCursorVisible(page);
        await page.keyboard.press("End");
        await page.keyboard.press("Control+v");

        await expect(page.getByTestId("yjs-table-view")).toHaveCount(2, { timeout: 30000 });
        const sqlNames = await page.locator("[data-testid='yjs-table-sql-name']").allTextContents();
        expect(sqlNames[1]).toBe(sqlNames[0]);
    });
});
