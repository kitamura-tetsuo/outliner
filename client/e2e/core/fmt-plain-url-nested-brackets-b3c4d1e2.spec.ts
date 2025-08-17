/** @feature FMT-b3c4d1e2
 *  Title   : Plain URL nested brackets
 *  Source  : docs/client-features.yaml
 */

import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

test.describe("Plain URL nested brackets", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        await TestHelpers.prepareTestEnvironment(page, testInfo);
    });

    test("does not linkify plain URL inside double brackets", async ({ page }) => {
        const item = page.locator(".outliner-item").first();
        await item.locator(".item-content").click();

        await page.keyboard.type("[[https://example.com label]]");
        await page.keyboard.press("Enter");
        await page.keyboard.type("Second item");

        const secondItemId = await TestHelpers.getItemIdByIndex(page, 1);
        expect(secondItemId).not.toBeNull();
        await page.locator(`.outliner-item[data-item-id=\"${secondItemId}\"]`).locator(".item-content").click();

        await page.waitForTimeout(500);

        const firstItemHtml = await page.locator(".outliner-item").first().locator(".item-text").innerHTML();
        expect(firstItemHtml).not.toContain('<a href="https://example.com"');
    });
});
