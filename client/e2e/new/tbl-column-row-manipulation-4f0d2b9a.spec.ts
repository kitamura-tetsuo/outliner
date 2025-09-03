/** @feature TBL-4f0d2b9a
 *  Title   : Table column and row manipulation
 *  Source  : docs/client-features.yaml
 */
import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

test.describe("TBL-4f0d2b9a: Table column and row manipulation", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        await TestHelpers.prepareTestEnvironment(page, testInfo);
    });

    async function setupTable(page: any) {
        await page.goto("/table");
        const sql = [
            "CREATE TABLE t(id TEXT PRIMARY KEY, a INTEGER, b INTEGER);",
            "INSERT INTO t VALUES('1',1,2);",
            "INSERT INTO t VALUES('2',3,4);",
            "SELECT id, a, b FROM t;",
        ].join(" ");
        await page.fill("textarea", sql);
        await page.click("text=Run");
        await page.waitForSelector(".editable-query-grid");
    }

    test("add column via header context menu", async ({ page }) => {
        await setupTable(page);
        const headers = page.locator(".editable-query-grid th");
        await expect(headers).toHaveCount(3);
        await headers.nth(0).click({ button: "right" });
        await expect(headers).toHaveCount(4);
        await expect(headers.nth(1)).toHaveText("col4");
    });

    test("columns can be reordered by drag and drop", async ({ page }) => {
        await setupTable(page);
        const headers = page.locator(".editable-query-grid th");
        await headers.nth(2).dragTo(headers.nth(1));
        await expect(headers.nth(1)).toHaveText("b");
    });

    test("rows can be reordered by drag and drop", async ({ page }) => {
        await setupTable(page);
        const rows = page.locator(".editable-query-grid tbody tr");
        await rows.nth(0).dragTo(rows.nth(1));
        const firstCell = page.locator(".editable-query-grid tbody tr").nth(0).locator("td").nth(0);
        await expect(firstCell).toHaveText("2");
    });
});
import "../utils/registerAfterEachSnapshot";
