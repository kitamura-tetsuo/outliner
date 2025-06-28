/** @feature ALS-0001
 *  Title   : Alias self-reference prevention
 *  Source  : docs/client-features.yaml
 */
import {
    expect,
    test,
} from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

test.describe("ALS-0001: Alias self-reference prevention", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        await TestHelpers.prepareTestEnvironment(page, testInfo);
    });

    test("prevent self-reference alias creation", async ({ page }) => {
        await TestHelpers.waitForOutlinerItems(page);
        const firstId = await TestHelpers.getItemIdByIndex(page, 0);
        if (!firstId) throw new Error("first item not found");

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

        await expect(page.locator(".alias-picker")).toBeVisible();
        const newIndex = await page.locator(".outliner-item").count() - 1;
        const aliasId = await TestHelpers.getItemIdByIndex(page, newIndex);
        if (!aliasId) throw new Error("alias item not found");
        const optionCount = await page.locator(".alias-picker li").count();
        expect(optionCount).toBeGreaterThan(0);

        // 自己参照エイリアスを試行（自分自身を選択）
        const selfSelector = `.alias-picker button[data-id="${aliasId}"]`;
        const selfButton = page.locator(selfSelector);
        
        // 自分自身のボタンが存在するかチェック
        const selfButtonExists = await selfButton.count() > 0;
        if (selfButtonExists) {
            await selfButton.click();
            
            // エイリアスピッカーが閉じることを確認
            await expect(page.locator(".alias-picker")).toBeHidden();
            
            // aliasTargetIdが設定されていないことを確認（自己参照は防止される）
            const aliasTargetId = await TestHelpers.getAliasTargetId(page, aliasId);
            expect(aliasTargetId).toBeNull();
            
            // エイリアスパスが表示されていないことを確認
            const isAliasPathVisible = await TestHelpers.isAliasPathVisible(page, aliasId);
            expect(isAliasPathVisible).toBe(false);
        } else {
            // 自分自身のボタンが存在しない場合（正常な動作）
            console.log("Self-reference button not found in options (expected behavior)");
            await TestHelpers.hideAliasPicker(page);
        }
    });
});
