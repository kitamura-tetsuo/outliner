/** @feature WSL-6fe3a9c1
 *  Title   : Update listener cleanup on reconnect
 *  Source  : docs/client-features.yaml
 */
import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

test.describe("Update listener cleanup", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        await TestHelpers.prepareTestEnvironment(page, testInfo);
    });

    test("editing works after reload", async ({ page }) => {
        const item = page.locator(".outliner-item").first();
        await item.click();
        await page.keyboard.type("abc");
        await page.reload();
        const item2 = page.locator(".outliner-item").first();
        await item2.click();
        await page.keyboard.type("d");
        await expect(item2.locator(".item-text")).toHaveText("abcd");
    });
});
