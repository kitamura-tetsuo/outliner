/** @feature SLR-0012
 *  Title   : 選択範囲の縮小
 *  Source  : docs/client-features.yaml
 */
import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

test.describe("SLR-0012: 選択範囲の縮小", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        await TestHelpers.prepareTestEnvironment(page, testInfo, [""]);
        const item = page.locator(".outliner-item").first();
        await item.locator(".item-content").click({ force: true });
        await page.waitForSelector("textarea.global-textarea:focus");
        await page.keyboard.press("Control+A");
        await page.keyboard.press("Delete");
        await page.keyboard.type("Hello World");
        await page.keyboard.press("Home");
        await page.keyboard.down("Shift");
        await page.keyboard.down("Alt");
        await page.keyboard.press("ArrowRight");
        await page.keyboard.up("Alt");
        await page.keyboard.up("Shift");
        await page.waitForTimeout(100);
    });

    test("Shift+Alt+Left clears selection", async ({ page }) => {
        await page.keyboard.down("Shift");
        await page.keyboard.down("Alt");
        await page.keyboard.press("ArrowLeft");
        await page.keyboard.up("Alt");
        await page.keyboard.up("Shift");
        await page.waitForTimeout(200);

        const count = await page.locator(".editor-overlay .selection").count();
        expect(count).toBe(0);
    });
});
