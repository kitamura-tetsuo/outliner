/** @feature TBL-0002
 *  Title   : Multi-statement query support
 *  Source  : docs/client-features.yaml
 */
import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

test.describe("TBL-0002: Multi-statement queries", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        await TestHelpers.prepareTestEnvironment(page, testInfo);
    });

    test("execute multiple SQL statements sequentially", async ({ page }) => {
        await page.goto("/table");
        await page.waitForSelector("textarea");

        const sql = [
            "CREATE TABLE ms(id INTEGER);",
            "INSERT INTO ms VALUES(1);",
            "SELECT id FROM ms;",
        ].join(" ");

        await page.fill("textarea", sql);
        await page.click("text=Run");
        await page.waitForSelector(".editable-query-grid td");

        const cellText = await page.locator(".editable-query-grid td").first().textContent();
        expect(cellText).toContain("1");
    });
});
