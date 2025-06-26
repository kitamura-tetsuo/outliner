/** @feature SLR-0013
 *  Title   : 現在行を選択
 *  Source  : docs/client-features.yaml
 */
import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

test.describe("SLR-0013: 現在行を選択", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        await TestHelpers.prepareTestEnvironment(page, testInfo, [
            "First line",
            "Second line",
            "Third line",
        ]);
        const item = page.locator(".outliner-item").nth(2);
        await item.locator(".item-content").click({ force: true });
        await page.waitForSelector("textarea.global-textarea:focus");
        await page.keyboard.press("Home");
    });

    test("Ctrl+L selects entire line", async ({ page }) => {
        await page.keyboard.down("Control");
        await page.keyboard.press("KeyL");
        await page.keyboard.up("Control");
        await page.waitForTimeout(200);
        await expect(page.locator(".editor-overlay .selection")).toBeVisible();
        const text = await page.evaluate(() => {
            const store = (window as any).editorOverlayStore;
            return store ? store.getSelectedText() : "";
        });
        expect(text).toBe("Second line");
    });
});
