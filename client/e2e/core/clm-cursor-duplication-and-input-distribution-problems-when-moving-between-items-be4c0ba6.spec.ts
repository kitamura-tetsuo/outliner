import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
/** @feature CLM-0101
 *  Title   : アイテム間移動時のカーソル重複と入力分散問題
 *  Source  : docs/client-features.yaml
 */
import { expect, test } from "@playwright/test";

import { CursorValidator } from "../utils/cursorValidation";
import { TestHelpers } from "../utils/testHelpers";

test.describe("カーソル重複問題の検証", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        await TestHelpers.prepareTestEnvironment(page, testInfo, ["", ""]);
    });

    test("修正後：アイテム間をクリックで移動してもカーソルが1つだけ存在する", async ({ page }) => {
        // 1. 最初のアイテムを3回クリック（重複カーソル作成の可能性をテスト）
        await page.locator(".item-content").first().click();
        await TestHelpers.waitForCursorVisible(page);
        await CursorValidator.validateCursorState(page, 1, "1回目のクリック後");

        await page.locator(".item-content").first().click();
        await TestHelpers.waitForCursorVisible(page);
        await CursorValidator.validateCursorState(page, 1, "2回目のクリック後");

        await page.locator(".item-content").first().click();
        await TestHelpers.waitForCursorVisible(page);
        await CursorValidator.validateCursorState(page, 1, "3回目のクリック後");

        // 2. 2番目のアイテムをクリック
        await page.locator("div:nth-child(2) > .outliner-item > .item-header > .item-content-container > .item-content")
            .click();
        await TestHelpers.waitForCursorVisible(page);
        await CursorValidator.validateCursorState(page, 1, "2番目のアイテムクリック後");

        // 3. テキスト「unique-input-A」を入力
        await page.keyboard.type("unique-input-A");
        await page.waitForTimeout(300); // テキスト入力の反映を待つ
        await CursorValidator.validateCursorState(page, 1, "テキスト入力後");

        // 4. 2番目のアイテムのテキスト内容を確認
        const secondItemText = await page.locator("div:nth-child(2) > .outliner-item").locator(".item-text")
            .textContent();
        console.log(`2番目のアイテムのテキスト: ${secondItemText}`);
        expect(secondItemText).toContain("unique-input-A"); // 2番目のアイテムに「unique-input-A」が含まれていることを確認

        // 5. 1番目のアイテムのテキスト内容を確認
        const firstItemText = await page.locator(".outliner-item").first().locator(".item-text").textContent();
        console.log(`1番目のアイテムのテキスト: ${firstItemText}`);
        expect(firstItemText).not.toContain("unique-input-A"); // 1番目のアイテムに「unique-input-A」が含まれていないことを確認

        // 6. 1番目のアイテムをクリック
        await page.locator(".item-content").first().click();
        await TestHelpers.waitForCursorVisible(page);
        await CursorValidator.validateCursorState(page, 1, "1番目のアイテムに戻った後");

        // 7. テキスト「unique-input-B」を入力
        await page.keyboard.type("unique-input-B");
        await page.waitForTimeout(300); // テキスト入力の反映を待つ
        await CursorValidator.validateCursorState(page, 1, "2回目のテキスト入力後");

        // 8. 1番目のアイテムのテキスト内容を確認
        const updatedFirstItemText = await page.locator(".outliner-item").first().locator(".item-text").textContent();
        console.log(`更新後の1番目のアイテムのテキスト: ${updatedFirstItemText}`);
        expect(updatedFirstItemText).toContain("unique-input-B"); // 1番目のアイテムに「unique-input-B」が含まれていることを確認

        // 9. 2番目のアイテムのテキスト内容を再確認
        const updatedSecondItemText = await page.locator("div:nth-child(2) > .outliner-item").locator(".item-text")
            .textContent();
        console.log(`更新後の2番目のアイテムのテキスト: ${updatedSecondItemText}`);
        expect(updatedSecondItemText).not.toContain("unique-input-B"); // 2番目のアイテムに「unique-input-B」が含まれていないことを確認
        expect(updatedSecondItemText).toContain("unique-input-A"); // 2番目のアイテムには「unique-input-A」が含まれていることを確認

        // 10. 最終的なカーソル状態を確認（点滅状態に関係なく、カーソルの存在のみを確認）
        await CursorValidator.validateCursorState(page, 1, "テスト終了時");
    });
});
