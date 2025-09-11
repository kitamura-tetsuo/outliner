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
        const firstItemId = await page.evaluate(() => {
            const el = document.querySelector(".outliner-item");
            return el?.getAttribute("data-item-id") || "";
        });
        expect(firstItemId).not.toBe("");

        await page.evaluate((itemId) => {
            const store = (window as any).editorOverlayStore;
            if (store) {
                store.clearCursorAndSelection("local");
                store.setCursor({ itemId, offset: 0, isActive: true, userId: "local" });
            }
        }, firstItemId);

        await page.evaluate(() => {
            const KeyEventHandler = (window as any).__KEY_EVENT_HANDLER__;
            const event = new KeyboardEvent("keydown", {
                key: "ArrowRight",
                altKey: true,
                shiftKey: true,
            });
            KeyEventHandler.handleBoxSelection(event);
        });

        const updatingInitial = await page.locator(".selection-box-updating").count();
        expect(updatingInitial).toBeGreaterThan(0);

        await page.waitForTimeout(600);
        const updatingAfter = await page.locator(".selection-box-updating").count();
        expect(updatingAfter).toBe(0);
    });
});
