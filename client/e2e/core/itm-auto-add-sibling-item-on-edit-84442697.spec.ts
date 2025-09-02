/** @feature ITM-0004
 *  Title   : Auto-add sibling on editing last item
 *  Source  : docs/client-features.yaml
 */
import { expect, test } from "@playwright/test";
import { DataValidationHelpers } from "../utils/dataValidationHelpers";
import { TestHelpers } from "../utils/testHelpers";

test.describe("ITM-0004: auto add sibling item", () => {
    test.afterEach(async ({ page }) => {
        // FluidとYjsのデータ整合性を確認
        await DataValidationHelpers.validateDataConsistency(page);
    });
    test.beforeEach(async ({ page }, testInfo) => {
        await TestHelpers.prepareTestEnvironment(page, testInfo, ["First"]);

        // 事前状態ではタイトル行＋1行のため2件を待つ
        await TestHelpers.waitForOutlinerItems(page, 60000, 2);
    });
    test("editing the bottom item adds new sibling", async ({ page }) => {
        const base = page.locator('[data-testid="outliner-base"]').first();
        await base.waitFor({ state: "visible" });
        const items = base.locator(".outliner-item");

        const countBefore = await items.count();

        const lastItem = items.nth(countBefore - 1);
        await lastItem.locator(".item-content").click({ force: true });
        await page.waitForSelector("textarea.global-textarea:focus");

        await page.keyboard.type(" hello");

        await page.waitForTimeout(500);

        const countAfter = await items.count();
        expect(countAfter).toBe(countBefore + 1);
    });
});
