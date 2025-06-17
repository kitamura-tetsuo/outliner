/** @feature MUL-0000 */
// Test for multi-cursor functionality.
import {
    expect,
    test,
} from "@playwright/test";

test.describe("マルチカーソル E2E テスト", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        // 認証状態を設定
        await page.addInitScript(() => {
        });
        await page.goto("/");
        // アウトライナーアイテムが表示されるのを待機
        await page.waitForSelector(".outliner-item", { timeout: 10000 });
    });

    test("Alt+Clickで複数カーソルを追加できる", async ({ page }) => {
        const items = page.locator(".outliner-item");

        // Ensure at least two items exist by creating them
        await items.first().locator(".item-content").click(); // Focus first item
        await page.keyboard.type("Item 1 for multi-cursor test");
        await page.keyboard.press("Enter");
        await page.keyboard.type("Item 2 for multi-cursor test");
        // Now we should have at least two items. The second one is focused.
        await expect(items).toHaveCount(2); // Or more, depending on initial state

        const cursorSelector = ".editor-overlay .cursor";

        // 1番目のアイテムにAlt+Click
        // Click the first item's text area to ensure it's the target
        await items.first().locator(".item-text").click({ modifiers: ["Alt"] });
        // カーソル要素が1つ表示される
        await expect(page.locator(cursorSelector)).toHaveCount(1, { timeout: 7000 });

        // 2番目のアイテムにAlt+Click
        await items.nth(1).locator(".item-text").click({ modifiers: ["Alt"] });
        await expect(page.locator(cursorSelector)).toHaveCount(2, { timeout: 7000 });

        // 再度1番目にAlt+Clickしても重複しない (or toggles off, then on if it's a toggle behavior)
        // Current EditorOverlayStore logic seems to make existing cursor active, or add if not present at exact offset.
        // Assuming Alt+Click on an item with an existing cursor might not change the total count if it just focuses.
        // If Alt+Click on an existing cursor *removes* it, this assertion would need to change.
        // Sticking to the original test's expectation that count remains 2.
        await items.first().locator(".item-text").click({ modifiers: ["Alt"] });
        await expect(page.locator(cursorSelector)).toHaveCount(2, { timeout: 7000 });
    });
});
