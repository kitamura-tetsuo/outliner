import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
/** @feature KBS-1a2b3c4d
 *  Title   : Box selection visual feedback removal
 *  Source  : docs/client-features.yaml
 */
import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

/**
 * 矩形選択の視覚フィードバックがタイムアウト後に削除されることを確認する
 */

test.describe("Box selection feedback", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        await TestHelpers.prepareTestEnvironment(page, testInfo);
    });

    test("selection-box-updating class removed after timeout", async ({ page }) => {
        // Create content first like other working tests do
        await page.locator(".outliner-item").first().click();
        await page.keyboard.type("First line of text");

        // Enterキーを押して新しいアイテムを作成
        await page.keyboard.press("Enter");
        await page.keyboard.type("Second line of text");

        // Enterキーを押して新しいアイテムを作成
        await page.keyboard.press("Enter");
        await page.keyboard.type("Third line of text");

        // Get the first item to make sure we have a cursor position
        const firstItemId = await page.evaluate(() => {
            const el = document.querySelector(".outliner-item");
            return el?.getAttribute("data-item-id") || "";
        });
        expect(firstItemId).not.toBe("");

        // Focus the global textarea and position cursor in the first item
        await page.locator(".outliner-item").first().click();
        await page.keyboard.press("Home"); // Go to start of line
        await page.locator(".global-textarea").focus();
        await page.waitForTimeout(200);

        // Enable debug mode to help troubleshoot
        await page.evaluate(() => {
            (window as any).DEBUG_MODE = true;
        });

        // Trigger box selection using keyboard shortcut - this should initiate box selection properly
        await page.keyboard.press("Alt+Shift+ArrowRight");
        await page.waitForTimeout(200); // Allow time for DOM update before checking

        // Wait for the .selection-box elements to appear first
        await expect.poll(async () => {
            const count = await page.locator(".selection-box").count();
            console.log(`Selection box count: ${count}`);
            return count;
        }, { timeout: 10000 }).toBeGreaterThan(0);

        // Wait for the .selection-box-updating class to appear, which should happen
        // after the selection boxes are rendered and the class is added by KeyEventHandler
        await expect.poll(async () => {
            const count = await page.locator(".selection-box-updating").count();
            console.log(`Selection box updating count: ${count}`);
            return count;
        }, { timeout: 10000 }).toBeGreaterThan(0);

        // Check that the .selection-box-updating class appears (the main assertion of this test)
        const updatingInitial = await page.locator(".selection-box-updating").count();
        expect(updatingInitial).toBeGreaterThan(0);

        await page.waitForTimeout(600);
        const updatingAfter = await page.locator(".selection-box-updating").count();
        expect(updatingAfter).toBe(0);
    });
});
