import {
    expect,
    test,
} from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

test.describe("ALS-0001: Alias change target", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        await TestHelpers.prepareTestEnvironment(page, testInfo);
    });

    test("change alias target and update path", async ({ page }) => {
        await TestHelpers.waitForOutlinerItems(page);
        const firstId = await TestHelpers.getItemIdByIndex(page, 0);
        const secondId = await TestHelpers.getItemIdByIndex(page, 1);
        const thirdId = await TestHelpers.getItemIdByIndex(page, 2);
        if (!firstId || !secondId || !thirdId) throw new Error("item ids not found");

        // create alias of first item
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

        // 最初のターゲットを設定（secondId）
        await TestHelpers.selectAliasOption(page, secondId);
        await expect(page.locator(".alias-picker")).toBeHidden();

        // エイリアスアイテムが作成されたことを確認
        await page.locator(`.outliner-item[data-item-id="${aliasId}"]`).waitFor({ state: "visible", timeout: 5000 });

        // 最初のaliasTargetIdが正しく設定されていることを確認
        let aliasTargetId = await TestHelpers.getAliasTargetId(page, aliasId);
        expect(aliasTargetId).toBe(secondId);

        // エイリアスパスが表示されていることを確認
        let isAliasPathVisible = await TestHelpers.isAliasPathVisible(page, aliasId);
        expect(isAliasPathVisible).toBe(true);

        // エイリアスターゲットを変更（thirdIdに変更）
        await TestHelpers.setAliasTarget(page, aliasId, thirdId);

        // 変更後のaliasTargetIdが正しく設定されていることを確認
        aliasTargetId = await TestHelpers.getAliasTargetId(page, aliasId);
        expect(aliasTargetId).toBe(thirdId);

        // エイリアスパスが更新されていることを確認
        isAliasPathVisible = await TestHelpers.isAliasPathVisible(page, aliasId);
        expect(isAliasPathVisible).toBe(true);
    });
});
