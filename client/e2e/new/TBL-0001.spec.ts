/** @feature TBL-0001
 *  Title   : Editable JOIN Table
 *  Source  : docs/client-features.yaml
 */
import {
    expect,
    test,
} from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

test.describe("TBL-0001: Editable JOIN Table", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        await TestHelpers.prepareTestEnvironment(page, testInfo);
    });

    test("query grid should be visible", async ({ page }) => {
        await page.goto("/table");
        await expect(page.locator(".editable-query-grid")).toBeVisible();
    });

    test("display query result", async ({ page }) => {
        await page.goto("/table");
        await page.waitForSelector("textarea");
        await page.fill("textarea", "SELECT 1 as value");
        await page.click("text=Run");
        await expect(page.locator("text=value")).toBeVisible();
        await expect(page.locator("text=1")).toBeVisible();
    });
});
