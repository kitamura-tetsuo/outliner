/** @feature SLR-0009
 *  Title   : ドラッグ＆ドロップによるテキスト移動
 *  Source  : docs/client-features.yaml
 */
import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

test.describe("SLR-0009: 選択範囲のドラッグ＆ドロップ", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        await page.evaluate(() => {
            (window as any).DEBUG_MODE = true;
        });
        await TestHelpers.prepareTestEnvironment(page, testInfo);
        await page.evaluate(() => {
            (window as any).DEBUG_MODE = true;
        });
        const item = page.locator(".outliner-item.page-title");
        if (await item.count() === 0) {
            const visibleItems = page.locator(".outliner-item").filter({ hasText: /.*/ });
            await visibleItems.first().locator(".item-content").click({ force: true });
        } else {
            await item.locator(".item-content").click({ force: true });
        }
        await page.waitForSelector("textarea.global-textarea:focus");
        const firstItem = page.locator(".outliner-item").nth(0);
        const firstId = await firstItem.getAttribute("data-item-id");
        await TestHelpers.setCursor(page, firstId!);
        await TestHelpers.insertText(page, firstId!, "First item text");
        await page.waitForTimeout(500);
        await page.keyboard.press("Enter");
        await TestHelpers.waitForCursorVisible(page);
        const secondItem = page.locator(".outliner-item").nth(1);
        const secondId = await secondItem.getAttribute("data-item-id");
        await TestHelpers.setCursor(page, secondId!);
        await TestHelpers.insertText(page, secondId!, "Second item text");
        await page.waitForTimeout(500);
        await page.keyboard.press("Enter");
        await TestHelpers.waitForCursorVisible(page);
        const thirdItem = page.locator(".outliner-item").nth(2);
        const thirdId = await thirdItem.getAttribute("data-item-id");
        await TestHelpers.setCursor(page, thirdId!);
        await TestHelpers.insertText(page, thirdId!, "Third item text");
        await page.waitForTimeout(500);
        await page.keyboard.press("Home");
        await page.keyboard.press("ArrowUp");
        await page.keyboard.press("ArrowUp");
        await page.keyboard.press("Home");
    });

    test("テキスト選択範囲をドラッグ＆ドロップで移動できる", async ({ page }) => {
        const itemCount = await page.locator(".outliner-item").count();
        expect(itemCount).toBeGreaterThanOrEqual(3);
        const firstItem = page.locator(".outliner-item").nth(0);
        await firstItem.locator(".item-content").click({ force: true });
        await page.waitForTimeout(300);
        await page.keyboard.down("Shift");
        for (let i = 0; i < 5; i++) {
            await page.keyboard.press("ArrowRight");
        }
        await page.keyboard.up("Shift");
        await page.waitForTimeout(300);
        const selectionExists = await page.evaluate(() => {
            return document.querySelector(".editor-overlay .selection") !== null;
        });
        expect(selectionExists).toBe(true);
        const selectedText = await page.evaluate(() => {
            const store = (window as any).editorOverlayStore;
            if (!store) return "";
            return store.getSelectedText();
        });
        expect(selectedText.length).toBeGreaterThan(0);
        await page.keyboard.press("Control+x");
        await page.waitForTimeout(300);
        const thirdItem = page.locator(".outliner-item").nth(2);
        await thirdItem.locator(".item-content").click({ force: true });
        await page.waitForTimeout(300);
        await page.keyboard.press("End");
        await page.keyboard.press("Control+v");
        await page.waitForTimeout(300);
        const firstItemTextAfter = await firstItem.locator(".item-text").textContent() || "";
        const thirdItemTextAfter = await thirdItem.locator(".item-text").textContent() || "";
        expect(firstItemTextAfter).not.toContain(selectedText);
        expect(thirdItemTextAfter).toContain(selectedText);
    });
});
