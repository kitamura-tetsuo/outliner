import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
/** @feature ALS-0001
 *  Title   : Alias self-reference prevention
 *  Source  : docs/client-features.yaml
 */
import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

test.describe("ALS-0001: Alias self-reference prevention", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        await TestHelpers.prepareTestEnvironment(page, testInfo, ["first item", "second item"]);
    });

    test("prevent self-reference alias creation", async ({ page }) => {
        await TestHelpers.waitForOutlinerItems(page);

        let firstId: string | null = null;
        for (let i = 0; i < 5; i++) {
            firstId = await TestHelpers.getItemIdByIndex(page, 0);
            if (firstId) break;
            await page.waitForTimeout(1000);
        }
        if (!firstId) {
            // Debugging info
            const count = await page.locator(".outliner-item").count();
            console.error(`Failed to find first item ID. Visible items: ${count}`);
            throw new Error("first item not found after retries");
        }

        await page.click(`.outliner-item[data-item-id="${firstId}"] .item-content`, { force: true });
        await TestHelpers.waitForUIStable(page);
        await page.evaluate(() => {
            const textarea = document.querySelector(".global-textarea") as HTMLTextAreaElement;
            textarea?.focus();
        });
        await TestHelpers.waitForUIStable(page);
        await page.waitForSelector("textarea.global-textarea:focus");

        await page.keyboard.type("/");
        await page.keyboard.type("alias");
        await page.keyboard.press("Enter");

        await expect(page.locator(".alias-picker").first()).toBeVisible({ timeout: 10000 });
        const newIndex = await page.locator(".outliner-item").count() - 1;
        const aliasId = await TestHelpers.getItemIdByIndex(page, newIndex);
        if (!aliasId) throw new Error("alias item not found");
        const optionCount = await page.locator(".alias-picker").first().locator("li").count();
        expect(optionCount).toBeGreaterThan(0);

        // 自己参照エイリアスを試行（自分自身を選択）
        const selfButtonCount = await page.locator(".alias-picker").first().locator(`button[data-id="${aliasId}"]`)
            .count();
        expect(selfButtonCount).toBe(0);
        await TestHelpers.hideAliasPicker(page);

        // aliasTargetIdが設定されていないことを確認（自己参照は防止される）
        const aliasTargetId = await TestHelpers.getAliasTargetId(page, aliasId);
        expect(aliasTargetId).toBeNull();

        // エイリアスパスが表示されていないことを確認
        const isAliasPathVisible = await TestHelpers.isAliasPathVisible(page, aliasId);
        expect(isAliasPathVisible).toBe(false);
    });
});
