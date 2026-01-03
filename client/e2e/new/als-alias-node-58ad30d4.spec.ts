import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
/** @feature ALS-0001
 *  Title   : Alias node referencing existing items
 *  Source  : docs/client-features.yaml
 */
import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

test.describe("ALS-0001: Alias node", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        test.setTimeout(90000);
        await TestHelpers.prepareTestEnvironment(page, testInfo, ["first item", "second item"]);
    });

    test("create and edit alias", async ({ page }) => {
        await TestHelpers.waitForOutlinerItems(page);
        const firstId = await TestHelpers.getItemIdByIndex(page, 0);
        const secondId = await TestHelpers.getItemIdByIndex(page, 1);
        if (!firstId || !secondId) throw new Error("item ids not found");

        await TestHelpers.setCursor(page, firstId);
        await page.evaluate(({ itemId }) => {
            const store = (window as any).editorOverlayStore;
            const cursor = store?.getCursorInstances?.().find((c: any) => c.itemId === itemId);
            const target = cursor?.findTarget?.();
            if (target && typeof target.updateText === "function") {
                target.updateText("");
                cursor.offset = 0;
            }
        }, { itemId: firstId });
        await TestHelpers.focusGlobalTextarea(page);
        await page.keyboard.type("/");
        await page.keyboard.type("alias");
        await page.keyboard.press("Enter");

        await expect(page.locator(".alias-picker").first()).toBeVisible();
        const aliasId = await page.evaluate(async () => {
            const timeout = Date.now() + 5000;
            while (!(window as any).aliasPickerStore && Date.now() < timeout) {
                await new Promise(resolve => setTimeout(resolve, 50));
            }
            return (window as any).aliasPickerStore?.itemId ?? null;
        });
        if (!aliasId) throw new Error("alias item not found on aliasPickerStore");
        console.log("Alias item id:", aliasId);
        const optionCount = await page.locator(".alias-picker").first().locator("li").count();
        expect(optionCount).toBeGreaterThan(0);

        // エイリアスターゲットを設定する（DOM操作ベース）
        await TestHelpers.selectAliasOption(page, secondId);
        await expect(page.locator(".alias-picker").first()).toBeHidden();

        // エイリアスアイテムが作成されたことを確認
        await page.locator(`.outliner-item[data-item-id="${aliasId}"]`).waitFor({ state: "visible", timeout: 5000 });

        // Yjsモデルへの反映を待機（ポーリングで確認）
        await TestHelpers.waitForUIStable(page);

        // aliasTargetIdが正しく設定されていることを確認（Yjsモデルから取得）
        const deadline = Date.now() + 5000;
        let aliasTargetId: string | null = null;
        while (Date.now() < deadline) {
            aliasTargetId = await TestHelpers.getAliasTargetId(page, aliasId);
            if (aliasTargetId === secondId) break;
            await page.waitForTimeout(100);
        }
        expect(aliasTargetId).toBe(secondId);

        // エイリアスパスが表示されていることを確認
        const isAliasPathVisible = await TestHelpers.isAliasPathVisible(page, aliasId);
        expect(isAliasPathVisible).toBe(true);

        // エイリアスサブツリーが表示されていることを確認
        const isAliasSubtreeVisible = await TestHelpers.isAliasSubtreeVisible(page, aliasId);
        expect(isAliasSubtreeVisible).toBe(true);
    });
});
