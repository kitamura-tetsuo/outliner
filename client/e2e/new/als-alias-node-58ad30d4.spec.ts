/** @feature ALS-0001
 *  Title   : Alias node referencing existing items
 *  Source  : docs/client-features.yaml
 */
import {
    expect,
    test,
} from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

test.describe("ALS-0001: Alias node", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        await TestHelpers.prepareTestEnvironment(page, testInfo);
    });

    test("create and edit alias", async ({ page }) => {
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

        await expect(page.locator(".alias-picker")).toBeVisible();
        const newIndex = await page.locator(".outliner-item").count() - 1;
        const aliasId = await TestHelpers.getItemIdByIndex(page, newIndex);
        if (!aliasId) throw new Error("alias item not found");
        const optionCount = await page.locator(".alias-picker li").count();
        expect(optionCount).toBeGreaterThan(0);

        // エイリアスターゲットを設定する（DOM操作ベース）
        await TestHelpers.selectAliasOption(page, secondId);
        await expect(page.locator(".alias-picker")).toBeHidden();

        // エイリアスアイテムが作成されたことを確認
        await page.locator(`.outliner-item[data-item-id="${aliasId}"]`).waitFor({ state: "visible", timeout: 5000 });

        // aliasTargetIdが正しく設定されていることを確認（DOM属性ベース）
        const aliasTargetId = await TestHelpers.getAliasTargetId(page, aliasId);
        expect(aliasTargetId).toBe(secondId);

        // エイリアスパスが表示されていることを確認
        const isAliasPathVisible = await TestHelpers.isAliasPathVisible(page, aliasId);
        expect(isAliasPathVisible).toBe(true);

        // エイリアスサブツリーが表示されていることを確認
        const isAliasSubtreeVisible = await TestHelpers.isAliasSubtreeVisible(page, aliasId);
        expect(isAliasSubtreeVisible).toBe(true);
    });
});
