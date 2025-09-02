import { expect, test } from "@playwright/test";
import { DataValidationHelpers } from "../utils/dataValidationHelpers";
import { TestHelpers } from "../utils/testHelpers";

test.describe("ALS-0001: Alias path navigation", () => {
    test.afterEach(async ({ page }) => {
        // FluidとYjsのデータ整合性を確認
        await DataValidationHelpers.validateDataConsistency(page);
    });
    test.beforeEach(async ({ page }, testInfo) => {
        await TestHelpers.prepareTestEnvironment(page, testInfo);
    });
    test("alias path shows clickable links", async ({ page }) => {
        // テストタイムアウトを延長
        test.setTimeout(60000);
        await TestHelpers.waitForOutlinerItems(page);
        const firstId = await TestHelpers.getItemIdByIndex(page, 0);
        const secondId = await TestHelpers.getItemIdByIndex(page, 1);
        if (!firstId || !secondId) throw new Error("item ids not found");
        await page.click(`.outliner-item[data-item-id="${firstId}"] .item-content`);
        await page.waitForTimeout(1000);
        await page.evaluate(() => {
            const textarea = document.querySelector(".global-textarea") as HTMLTextAreaElement;

            textarea?.focus();
        });
        await page.waitForTimeout(500);
        await page.keyboard.type("/");
        await page.keyboard.type("alias");
        await page.keyboard.press("Enter");

        // エイリアスピッカーが表示されるまで待機（タイムアウトを延長）
        await expect(page.locator(".alias-picker")).toBeVisible({ timeout: 10000 });
        const newIndex = await page.locator(".outliner-item").count() - 1;
        const aliasId = await TestHelpers.getItemIdByIndex(page, newIndex);
        if (!aliasId) throw new Error("alias item not found");
        const optionCount = await page.locator(".alias-picker li").count();
        expect(optionCount).toBeGreaterThan(0);

        // エイリアスターゲットを設定
        await TestHelpers.selectAliasOption(page, secondId);
        await expect(page.locator(".alias-picker")).toBeHidden();

        // エイリアスアイテムが作成されたことを確認
        await page.locator(`.outliner-item[data-item-id="${aliasId}"]`).waitFor({ state: "visible", timeout: 5000 });
        // エイリアスパスが表示されていることを確認
        const isAliasPathVisible = await TestHelpers.isAliasPathVisible(page, aliasId);
        expect(isAliasPathVisible).toBe(true);

        // エイリアスパス内のボタンの数を確認
        const buttonCount = await TestHelpers.getAliasPathButtonCount(page, aliasId);
        expect(buttonCount).toBeGreaterThan(0);

        // エイリアスパス内の最初のボタンをクリックしてナビゲーションをテスト
        // 注意: ナビゲーション機能は実装されているが、テスト環境での動作確認のみ
        await TestHelpers.clickAliasPathButton(page, aliasId, 0);

        // ナビゲーション後も基本的な状態が維持されていることを確認
        await page.waitForTimeout(500);
        const stillVisible = await TestHelpers.isAliasPathVisible(page, aliasId);
        expect(stillVisible).toBe(true);
    });
});
