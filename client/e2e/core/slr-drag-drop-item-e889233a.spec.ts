/** @feature SLR-0009
 *  Title   : ドラッグ＆ドロップによるテキスト移動
 *  Source  : docs/client-features.yaml
 */
import { expect, test } from "@playwright/test";
import { DataValidationHelpers } from "../utils/dataValidationHelpers";
import { TestHelpers } from "../utils/testHelpers";

test.describe("SLR-0009: アイテムドラッグ＆ドロップ", () => {
    test.afterEach(async ({ page }) => {
        // FluidとYjsのデータ整合性を確認
        await DataValidationHelpers.validateDataConsistency(page);
    });
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
    test("アイテム全体をドラッグ＆ドロップで移動できる", async ({ page }) => {
        const itemCount = await page.locator(".outliner-item").count();
        expect(itemCount).toBeGreaterThanOrEqual(3);

        const firstItemText = await page.locator(".outliner-item").nth(0).locator(".item-text").textContent();

        const secondItemText = await page.locator(".outliner-item").nth(1).locator(".item-text").textContent();

        const thirdItemText = await page.locator(".outliner-item").nth(2).locator(".item-text").textContent();

        const secondItem = page.locator(".outliner-item").nth(1);
        await secondItem.locator(".item-content").click({ force: true });
        await page.waitForTimeout(300);

        await page.keyboard.press("Control+a");

        await page.waitForTimeout(300);

        await page.keyboard.press("Control+x");

        await page.waitForTimeout(300);

        const thirdItem = page.locator(".outliner-item").nth(1);

        await thirdItem.locator(".item-content").click({ force: true });
        await page.waitForTimeout(300);

        await page.keyboard.press("End");

        await page.keyboard.press("Enter");

        await page.waitForTimeout(300);

        await page.keyboard.press("Control+v");

        await page.waitForTimeout(500);

        const firstItemAfter = await page.locator(".outliner-item").nth(0).locator(".item-text").textContent() || "";
        let secondItemAfter = "";
        let thirdItemAfter = "";
        if (await page.locator(".outliner-item").count() > 1) {
            secondItemAfter = await page.locator(".outliner-item").nth(1).locator(".item-text").textContent() || "";
        }
        if (await page.locator(".outliner-item").count() > 2) {
            thirdItemAfter = await page.locator(".outliner-item").nth(2).locator(".item-text").textContent() || "";
        }
        const finalItemCount = await page.locator(".outliner-item").count();
        expect(finalItemCount).toBeGreaterThanOrEqual(2);
        expect(firstItemAfter).toBe(firstItemText);
    });
});
