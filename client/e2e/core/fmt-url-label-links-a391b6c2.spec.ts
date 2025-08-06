/** @feature FMT-a391b6c2
 *  Title   : URL label links
 *  Source  : docs/client-features.yaml
 */

import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

test.describe("URL label links", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        await TestHelpers.prepareTestEnvironment(page, testInfo);
    });

    test("converts [URL label] to link with label text", async ({ page }) => {
        const item = page.locator(".outliner-item").first();
        await item.locator(".item-content").click();

        await page.keyboard.type("Please see [https://example.com Example Site]");
        await page.keyboard.press("Enter");
        await page.keyboard.type("Second item");

        const secondItemId = await TestHelpers.getItemIdByIndex(page, 1);
        expect(secondItemId).not.toBeNull();
        await page.locator(`.outliner-item[data-item-id="${secondItemId}"]`).locator(".item-content").click();

        await page.waitForTimeout(500);

        const firstItemHtml = await page.locator(".outliner-item").first().locator(".item-text").innerHTML();
        expect(firstItemHtml).toContain('<a href="https://example.com"');
        expect(firstItemHtml).toContain(">Example Site</a>");
        expect(firstItemHtml).not.toContain(">https://example.com</a>");
    });
});
