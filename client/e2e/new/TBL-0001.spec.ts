/** @feature TBL-0001
 *  Title   : Editable JOIN Table
 *  Source  : docs/client-features.yaml
 */
import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

test.describe("TBL-0001: Editable JOIN Table", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        await TestHelpers.prepareTestEnvironment(page, testInfo);
    });

    test("query grid should be visible", async ({ page }) => {
        await page.goto("/table");
        await expect(page.locator(".editable-query-grid")).toBeVisible();
    });
});
