/** @feature OFF-NON
 *  Title   : Offline editing disabled
 *  Source  : docs/NON_GOALS.md
 */
import {
    expect,
    test,
} from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

test.describe("OFF-NON: Offline editing disabled", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        await TestHelpers.prepareTestEnvironment(page, testInfo);
    });

    test("cannot edit while offline", async ({ page }) => {
        await TestHelpers.waitForOutlinerItems(page);
        const firstId = await TestHelpers.getItemIdByIndex(page, 0);
        if (!firstId) throw new Error("item id not found");

        await page.context().setOffline(true);
        await page.click(`.outliner-item[data-item-id="${firstId}"] .item-content`);
        await page.keyboard.type(" offline");
        await page.context().setOffline(false);
        await page.waitForTimeout(1000);
        await expect(
            page.locator(`.outliner-item[data-item-id="${firstId}"] .item-content`),
        ).not.toContainText("offline");
    });
});
