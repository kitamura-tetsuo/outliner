import { expect, test } from "@playwright/test";
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
        await page.locator(`.outliner-item[data-item-id="${firstId}"] .item-content`).click({ force: true });
        await page.waitForTimeout(1000);
        await page.evaluate(() => {
            const textarea = document.querySelector(".global-textarea") as HTMLTextAreaElement;
            textarea?.focus();
        });
        await page.waitForTimeout(500);
        await page.keyboard.type("/");
        await page.keyboard.type("alias");
        await page.keyboard.press("Enter");
        const newIndex = await page.locator(".outliner-item").count() - 1;
        const aliasId = await TestHelpers.getItemIdByIndex(page, newIndex);
        if (!aliasId) throw new Error("alias item not found");

        // 最初のターゲットを設定（secondId） — UIに依存せずストア経由で確定
        await page.evaluate(({ aliasId, secondId }) => {
            const store: any = (window as any).aliasPickerStore;
            if (store) {
                store.show(aliasId);
                store.confirmById(secondId);
            }
        }, { aliasId, secondId });
        await expect(page.locator(".alias-picker").first()).toBeHidden();

        // エイリアスアイテムが作成されたことを確認
        await page.locator(`.outliner-item[data-item-id="${aliasId}"]`).waitFor({ state: "visible", timeout: 5000 });

        // Yjsモデルへの反映を待機（ポーリングで確認）
        await page.waitForTimeout(500);

        // 最初のaliasTargetIdが正しく設定されていることを確認
        let deadline = Date.now() + 5000;
        let aliasTargetId: string | null = null;
        while (Date.now() < deadline) {
            aliasTargetId = await TestHelpers.getAliasTargetId(page, aliasId);
            if (aliasTargetId === secondId) break;
            await page.waitForTimeout(100);
        }
        expect(aliasTargetId).toBe(secondId);

        // エイリアスパスが表示されていることを確認
        let isAliasPathVisible = await TestHelpers.isAliasPathVisible(page, aliasId);
        expect(isAliasPathVisible).toBe(true);

        // エイリアスターゲットを変更（thirdIdに変更） — ストア経由で確定
        await page.evaluate(({ aliasId, thirdId }) => {
            const store: any = (window as any).aliasPickerStore;
            if (store) {
                store.show(aliasId);
                store.confirmById(thirdId);
            }
        }, { aliasId, thirdId });

        // Yjsモデルへの反映を待機（ポーリングで確認）
        await page.waitForTimeout(500);

        // 変更後のaliasTargetIdが正しく設定されていることを確認
        deadline = Date.now() + 5000;
        aliasTargetId = null;
        while (Date.now() < deadline) {
            aliasTargetId = await TestHelpers.getAliasTargetId(page, aliasId);
            if (aliasTargetId === thirdId) break;
            await page.waitForTimeout(100);
        }
        expect(aliasTargetId).toBe(thirdId);

        // エイリアスパスが更新されていることを確認
        isAliasPathVisible = await TestHelpers.isAliasPathVisible(page, aliasId);
        expect(isAliasPathVisible).toBe(true);
    });
});
import "../utils/registerAfterEachSnapshot";
