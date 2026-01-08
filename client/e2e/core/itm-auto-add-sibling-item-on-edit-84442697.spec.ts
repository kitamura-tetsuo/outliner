import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
/** @feature ITM-auto-add-sibling-item-on-edit-84442697
 *  Title   : Auto-add sibling on editing last item
 *  Source  : docs/client-features.yaml
 */
import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

test.describe("ITM-auto-add-sibling-item-on-edit-84442697: auto add sibling item", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        await TestHelpers.prepareTestEnvironment(page, testInfo, ["First"]);
        await TestHelpers.waitForOutlinerItems(page);
    });

    test("editing the bottom item adds new sibling", async ({ page }) => {
        const items = page.locator(".outliner-item");
        const countBefore = await items.count();

        const lastItem = items.nth(countBefore - 1);
        await lastItem.locator(".item-content").click({ force: true });
        await page.waitForSelector("textarea.global-textarea:focus");

        await page.keyboard.type(" hello");
        await page.waitForTimeout(500);

        const countAfter = await page.locator(".outliner-item").count();
        expect(countAfter).toBe(countBefore + 1);
    });
});
