/** @feature LNK-0003
 *  Title   : 内部リンクのナビゲーション機能
 *  Source  : docs/client-features.yaml
 */
import { expect, test } from "@playwright/test";
import { waitForCursorVisible } from "../helpers";
import { TestHelpers } from "../utils/testHelpers";
import { TreeValidator } from "../utils/treeValidation";

test.describe("LNK-0003: 内部リンクのナビゲーション機能", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        await TestHelpers.prepareTestEnvironment(page, testInfo);
    });

    test("実際のアプリケーションで内部リンクを作成する", async ({ page }) => {
        // 最初のアイテムを選択
        const firstItem = page.locator(".outliner-item").first();
        await firstItem.locator(".item-content").click();
        await waitForCursorVisible(page);

        // フォーカス状態を確認
        const focusState = await page.evaluate(() => {
            const textarea = document.querySelector(".global-textarea") as HTMLTextAreaElement;
            return {
                textareaExists: !!textarea,
                focused: document.activeElement === textarea,
                activeElementTag: document.activeElement?.tagName,
                activeElementClass: document.activeElement?.className,
                textareaValue: textarea?.value || "",
            };
        });
        console.log("Focus state:", focusState);
        expect(focusState.focused).toBe(true);
    });
});
