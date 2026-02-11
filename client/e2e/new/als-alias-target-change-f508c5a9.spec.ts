import "../utils/registerAfterEachSnapshot";
import { expect, test } from "@playwright/test";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
import { TestHelpers } from "../utils/testHelpers";
registerCoverageHooks();

test.describe("ALS-0001: Alias change target", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        await TestHelpers.prepareTestEnvironment(page, testInfo, [
            "This is a test page. 1",
            "This is a test page. 2",
            "This is a test page. 3",
        ]);
    });

    test("change alias target and update path", async ({ page }) => {
        await TestHelpers.waitForOutlinerItems(page);

        // Retry logic for fetching IDs
        let firstId = await TestHelpers.getItemIdByIndex(page, 0);
        if (!firstId) {
            await page.waitForTimeout(1000);
            firstId = await TestHelpers.getItemIdByIndex(page, 0);
        }

        let secondId = await TestHelpers.getItemIdByIndex(page, 1);
        if (!secondId) {
            await page.waitForTimeout(1000);
            secondId = await TestHelpers.getItemIdByIndex(page, 1);
        }

        let thirdId = await TestHelpers.getItemIdByIndex(page, 2);
        if (!thirdId) {
            await page.waitForTimeout(1000);
            thirdId = await TestHelpers.getItemIdByIndex(page, 2);
        }

        if (!firstId || !secondId || !thirdId) throw new Error("item ids not found");

        // create alias of first item
        await page.locator(`.outliner-item[data-item-id="${firstId}"] .item-content`).click({ force: true });
        await TestHelpers.waitForUIStable(page);
        await page.evaluate(() => {
            const textarea = document.querySelector(".global-textarea") as HTMLTextAreaElement;
            textarea?.focus();
        });
        await TestHelpers.waitForUIStable(page);
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
        await TestHelpers.waitForUIStable(page);

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
        await TestHelpers.waitForUIStable(page);

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
