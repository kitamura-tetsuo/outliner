import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
/** @feature DBW-001
 *  Title   : Client-Side SQL Database
 *  Source  : docs/client-features.yaml
 */
import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

test.describe("DBW-001: Client-Side SQL Database", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        await TestHelpers.seedProjectAndNavigate(page, testInfo);
    });

    test("run basic SQL query", async ({ page }) => {
        await page.goto("/sql");
        await page.waitForSelector("textarea");

        // Setup DB state without using UI to bypass SELECT restriction
        // eslint-disable-next-line no-restricted-globals
        await page.waitForFunction(() => typeof (window as any).rawExec !== "undefined", { timeout: 10000 });
        await page.evaluate(async () => {
            // eslint-disable-next-line no-restricted-globals
            await (window as any).initDb?.();
            // eslint-disable-next-line no-restricted-globals
            if (!(window as any).rawExec) throw new Error("window.rawExec not defined");
            // eslint-disable-next-line no-restricted-globals
            ((window as any).rawExec)(
                "CREATE TABLE tbl(id TEXT PRIMARY KEY, val INTEGER); INSERT INTO tbl VALUES('1',1);",
            );
        });

        const sql = "SELECT val AS tbl_val FROM tbl;";
        await page.fill("textarea", sql);
        await page.click("text=Run");
        await expect(page.locator(".editable-query-grid")).toContainText("tbl_val");
        await expect(page.locator(".editable-query-grid")).toContainText("1");
    });
});
