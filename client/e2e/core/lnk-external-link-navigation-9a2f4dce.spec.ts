/** @feature LNK-9a2f4dce
 *  Title   : External link navigation
 *  Source  : docs/client-features.yaml
 */

import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

(test.describe)("External link navigation", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        await TestHelpers.prepareTestEnvironment(page, testInfo);
    });

    test("clicking bracketed URL opens the target", async ({ page }) => {
        const item = page.locator(".outliner-item").first();
        await item.locator(".item-content").click();

        await page.keyboard.type("[https://example.com]");
        await page.keyboard.press("Enter");
        await page.keyboard.type("Second item");

        const secondItemId = await TestHelpers.getItemIdByIndex(page, 1);
        expect(secondItemId).not.toBeNull();
        await page.locator(`.outliner-item[data-item-id="${secondItemId}"]`).locator(".item-content").click();

        await page.waitForTimeout(500);

        const link = page.locator(".outliner-item").first().locator("a");
        await expect(link).toBeVisible();

        const [popup] = await Promise.all([
            page.waitForEvent("popup"),
            link.click(),
        ]);
        await popup.waitForLoadState();
        expect(popup.url()).toContain("https://example.com");
        await popup.close();
    });
});
import "../utils/registerAfterEachSnapshot";
