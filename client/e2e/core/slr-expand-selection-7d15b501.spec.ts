/** @feature SLR-0011
 *  Title   : 選択範囲の拡張
 *  Source  : docs/client-features.yaml
 */
import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

test.describe("SLR-0011: 選択範囲の拡張", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        await TestHelpers.prepareTestEnvironment(page, testInfo, [""]);
        const item = page.locator(".outliner-item").first();
        await item.locator(".item-content").click({ force: true });
        await page.waitForSelector("textarea.global-textarea:focus");
        await page.keyboard.press("Control+A");
        await page.keyboard.press("Delete");
        await page.keyboard.type("Hello World");
        await page.keyboard.press("Home");
    });

    test("Shift+Alt+Right expands selection", async ({ page }) => {
        await page.keyboard.down("Shift");
        await page.keyboard.down("Alt");
        await page.keyboard.press("ArrowRight");
        await page.keyboard.up("Alt");
        await page.keyboard.up("Shift");
        await page.waitForTimeout(200);

        await expect(page.locator(".editor-overlay .selection")).toBeVisible();
        const text = await page.evaluate(() => {
            const store = (window as any).editorOverlayStore;
            return store ? store.getSelectedText() : "";
        });
        expect(text).toBe("Hello World");
    });
});
