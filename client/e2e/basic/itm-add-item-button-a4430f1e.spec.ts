/** @feature ITM-0002
 *  Title   : ボタンでアイテム追加
 *  Source  : docs/client-features.yaml
 */
import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

test.describe("ITM-0002: Add item via button", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        await TestHelpers.prepareTestEnvironment(page, testInfo);
    });

    test("clicking add item button appends new item", async ({ page }) => {
        await TestHelpers.waitForOutlinerItems(page);
        const itemCountBefore = await page.locator(".outliner-item").count();
        await page.click('button:has-text("アイテム追加")');
        await page.locator('.outliner-item').nth(itemCountBefore).waitFor({ state: "visible" });
        const itemCountAfter = await page.locator(".outliner-item").count();
        expect(itemCountAfter).toBeGreaterThan(itemCountBefore);
    });
});
