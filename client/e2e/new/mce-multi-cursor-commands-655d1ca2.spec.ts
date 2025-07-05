/** @feature MCE-0002
 *  Title   : VS Code style multi-cursor commands
 *  Source  : docs/client-features.yaml
 */
import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

test.describe("MCE-0002: multi-cursor commands", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        await TestHelpers.prepareTestEnvironment(page, testInfo, ["first", "second"]);
    });

    test("add cursor below and undo", async ({ page }) => {
        const firstId = await page.locator(".outliner-item").nth(1).getAttribute("data-item-id");
        await TestHelpers.setCursor(page, firstId!, 0, "local");
        await TestHelpers.waitForCursorVisible(page);

        // カーソル追加前の状態を確認
        const countBefore = await page.evaluate(() => Object.keys((window as any).editorOverlayStore.cursors).length);
        expect(countBefore).toBe(1);

        // キーボードショートカットでカーソルを追加
        await page.keyboard.press("Control+Shift+Alt+ArrowDown");
        await TestHelpers.waitForCursorVisible(page);

        // カーソル追加後の状態を確認
        const countAfter = await page.evaluate(() => Object.keys((window as any).editorOverlayStore.cursors).length);
        expect(countAfter).toBe(2);

        // Undoでカーソルを削除
        await page.keyboard.press("Control+Shift+z");
        const countUndo = await page.evaluate(() => Object.keys((window as any).editorOverlayStore.cursors).length);
        expect(countUndo).toBe(1);
    });
});
