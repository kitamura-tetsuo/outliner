import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
/** @feature FTR-7b3e9c42
 *  Title   : Cross-table aggregation with project-unique SQL names
 *  Source  : docs/client-features/tbl-cross-table-aggregation-7b3e9c42.yaml
 */
import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

test.describe("FTR-7b3e9c42: SQL names are unique within a project", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        test.setTimeout(120000);
        await TestHelpers.seedProjectAndNavigate(page, testInfo, ["First table", "Second table"]);
        await expect(page.locator(".outliner-item").first()).toBeVisible({ timeout: 10000 });
    });

    test("derives a SQL name from the display name and keeps it unique", async ({ page }) => {
        await page.locator(".outliner-item").first().click();
        await page.waitForTimeout(300);
        await page.getByTestId("main-toolbar").locator(".add-database-btn:not(.undo-redo-btn)").first().click();

        const panel = page.getByTestId("yjs-table-create-panel").first();
        await expect(panel).toBeVisible({ timeout: 10000 });

        // A Japanese display name cannot be an identifier, so a usable one is
        // suggested instead of silently producing a broken CREATE TABLE.
        await panel.getByTestId("yjs-table-name-input").fill("売上管理");
        await expect(panel.getByTestId("yjs-table-sql-name-input")).toHaveValue("data");

        await panel.getByTestId("yjs-table-name-input").fill("Sales 2026");
        await expect(panel.getByTestId("yjs-table-sql-name-input")).toHaveValue("sales_2026");

        // An identifier Postgres would reject is refused before the table exists.
        await panel.getByTestId("yjs-table-sql-name-input").fill("Sales Table");
        await panel.getByTestId("yjs-table-create").click();
        await expect(panel.getByTestId("yjs-table-create-error")).toContainText("lower case", {
            timeout: 10000,
        });

        await panel.getByTestId("yjs-table-sql-name-input").fill("sales");
        await panel.getByTestId("yjs-table-create").click();
        await expect(page.getByTestId("yjs-table-view").first()).toBeVisible({ timeout: 15000 });
        await expect(page.getByTestId("yjs-table-sql-name").first()).toHaveText("sales");

        // A second table cannot take the same name: queries must be able to
        // tell the two apart.
        await page.locator(".outliner-item").nth(1).click();
        await page.waitForTimeout(300);
        await page.getByTestId("main-toolbar").locator(".add-database-btn:not(.undo-redo-btn)").first().click();

        // The first block is a table view by now, so this is the only panel.
        const secondPanel = page.getByTestId("yjs-table-create-panel").first();
        await expect(secondPanel).toBeVisible({ timeout: 10000 });
        await secondPanel.getByTestId("yjs-table-sql-name-input").fill("sales");
        await secondPanel.getByTestId("yjs-table-create").click();
        await expect(secondPanel.getByTestId("yjs-table-create-error")).toContainText("already used", {
            timeout: 10000,
        });

        // The suggestion for the same display name avoids the taken one.
        await secondPanel.getByTestId("yjs-table-sql-name-input").fill("sales_2");
        await secondPanel.getByTestId("yjs-table-create").click();
        await expect(page.getByTestId("yjs-table-sql-name").nth(1)).toHaveText("sales_2", {
            timeout: 15000,
        });
    });
});
