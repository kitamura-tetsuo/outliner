import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
/** @feature ITM-0003
 *  Title   : Delete empty items with Delete key
 *  Source  : docs/client-features.yaml
 */
import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

test.describe("ITM-0003: Delete empty item", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        await TestHelpers.prepareTestEnvironment(page, testInfo, ["Item 1", "Item 2"]);
    });

    test("pressing Delete on empty item removes it", async ({ page }) => {
        await TestHelpers.waitForOutlinerItems(page);

        const items = page.locator(".outliner-item");
        const countBefore = await items.count();

        const secondItem = items.nth(1);
        await secondItem.locator(".item-content").click({ force: true });
        await page.keyboard.press("Control+A");
        await page.keyboard.press("Delete");
        await TestHelpers.waitForCursorVisible(page);

        await page.keyboard.press("Delete");
        await page.waitForTimeout(500);

        const countAfter = await items.count();
        expect(countAfter).toBe(countBefore - 1);
    });
});
