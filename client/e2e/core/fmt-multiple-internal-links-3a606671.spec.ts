/** @feature FMT-0008
 *  Title   : Support multiple internal links in one item
 *  Source  : docs/client-features.yaml
 */
import { test, expect } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

/**
 * @file FMT-0008.spec.ts
 * @playwright
 */

test.describe("FMT-0008: multiple internal links", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        await TestHelpers.prepareTestEnvironment(page, testInfo);
    });

    test("multiple internal links are displayed", async ({ page }) => {
        // select first item
        const firstId = await TestHelpers.getItemIdByIndex(page, 0);
        expect(firstId).not.toBeNull();
        await TestHelpers.clickItemToEdit(page, `.outliner-item[data-item-id="${firstId}"] .item-content`);

        // type text with multiple internal links
        await page.keyboard.type("This is [test-page] and [/project/other-page]");

        // add second item to apply formatting
        await page.keyboard.press("Enter");
        await page.keyboard.type("second item");

        // wait for formatting
        await page.waitForTimeout(500);

        // verify both links are present
        const html = await page.locator(`.outliner-item[data-item-id="${firstId}"] .item-text`).innerHTML();
        expect(html).toMatch(/<a href="\/test-page"[^>]*class="[^"]*internal-link[^"]*"[^>]*>test-page<\/a>/);
        expect(html).toMatch(/<a href="\/project\/other-page"[^>]*class="[^"]*internal-link[^"]*project-link[^"]*"[^>]*>project\/other-page<\/a>/);
    });
});
