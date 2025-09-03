/** @feature DBW-001
 *  Title   : Client-Side SQL Database
 *  Source  : docs/client-features.yaml
 */
import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

test.describe("DBW-001: Client-Side SQL Database", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        await TestHelpers.prepareTestEnvironment(page, testInfo);
    });

    test("run basic SQL query", async ({ page }) => {
        await page.goto("/sql");
        await page.waitForSelector("textarea");
        const sql = [
            "CREATE TABLE tbl(id TEXT PRIMARY KEY, val INTEGER);",
            "INSERT INTO tbl VALUES('1',1);",
            "SELECT val AS tbl_val FROM tbl;",
        ].join(" ");
        await page.fill("textarea", sql);
        await page.click("text=Run");
        await expect(page.locator(".editable-query-grid")).toContainText("tbl_val");
        await expect(page.locator(".editable-query-grid")).toContainText("1");
    });
});
import "../utils/registerAfterEachSnapshot";
