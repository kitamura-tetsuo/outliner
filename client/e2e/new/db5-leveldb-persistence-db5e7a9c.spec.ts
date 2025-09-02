/** @feature FTR-db5e7a9c
 *  Title   : LevelDB persistence
 *  Source  : docs/client-features.yaml
 */
import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

test.describe("LevelDB persistence", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        await TestHelpers.prepareTestEnvironment(page, testInfo);
    });

    test("document state persists across reload", async ({ page }) => {
        await page.click('button:has-text("アイテム追加")');
        const item = page.locator(".outliner-item").last();
        await item.locator(".item-content").click();
        await page.keyboard.type("hello");
        await page.reload();
        const text = await page.locator(".outliner-item .item-text").last().textContent();
        expect(text).toBe("hello");
    });
});
