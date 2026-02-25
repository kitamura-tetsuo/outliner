import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
/** @feature FMT-0002
 *  Title   : Formatting combinations
 *  Source  : docs/client-features.yaml
 */

import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

test.describe("Formatting combinations", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        await TestHelpers.prepareTestEnvironment(page, testInfo);
    });

    test("Bold and italic combination is displayed correctly", async ({ page }) => {
        // Create data with lines parameter of prepareTestEnvironment
        await TestHelpers.prepareTestEnvironment(page, test.info(), [
            "This is [[a combination of bold and [/ italic]]].",
        ]);

        // Wait a little for formatting to be applied
        await TestHelpers.waitForOutlinerItems(page);

        // Get the 2nd item (first item that is not the page title)
        const firstItem = page.locator(".outliner-item").nth(1);

        // Get the HTML of the .item-text element
        const firstItemHtml = await firstItem.locator(".item-text").first().innerHTML();

        // Verify that the bold and italic combination is displayed correctly
        expect(firstItemHtml).toContain("<strong>");
        expect(firstItemHtml).toContain("a combination of bold and ");
        expect(firstItemHtml).toContain("<em>");
        expect(firstItemHtml).toContain("italic");
        expect(firstItemHtml).toContain("</em>");
        expect(firstItemHtml).toContain("</strong>");
    });

    test("Bold and strikethrough combination is displayed correctly", async ({ page }) => {
        // Create data with lines parameter of prepareTestEnvironment
        await TestHelpers.prepareTestEnvironment(page, test.info(), [
            "This is [[a combination of bold and [-strikethrough]]].",
        ]);

        // Wait a little for formatting to be applied
        await TestHelpers.waitForOutlinerItems(page);

        // Verify the HTML of the 2nd item (first item that is not the page title)
        const secondItem = page.locator(".outliner-item").nth(1);
        await secondItem.waitFor({ state: "visible" });
        const firstItemHtml = await secondItem.locator(".item-text").first().innerHTML();

        // Verify that the bold and strikethrough combination is displayed correctly
        expect(firstItemHtml).toContain("<strong>");
        expect(firstItemHtml).toContain("a combination of bold and ");
        expect(firstItemHtml).toContain("<s>");
        expect(firstItemHtml).toContain("strikethrough");
        expect(firstItemHtml).toContain("</s>");
        expect(firstItemHtml).toContain("</strong>");
    });

    test("Italic and code combination is displayed correctly", async ({ page }) => {
        // Create data with lines parameter of prepareTestEnvironment
        await TestHelpers.prepareTestEnvironment(page, test.info(), [
            "This is [/ a combination of italic and `code`].",
        ]);

        // Wait a little for formatting to be applied
        await TestHelpers.waitForOutlinerItems(page);

        // Verify the HTML of the 2nd item (first item that is not the page title)
        const firstItem = page.locator(".outliner-item").nth(1);
        await firstItem.waitFor({ state: "visible" });
        // Wait for specific formatting to appear to handle hydration/rendering delays
        await firstItem.locator("em").waitFor({ state: "attached", timeout: 5000 }).catch(() => {});

        const firstItemHtml = await firstItem.locator(".item-text").first().innerHTML();

        // Verify that the italic and code combination is displayed correctly
        expect(firstItemHtml).toContain("<em>");
        expect(firstItemHtml).toContain("a combination of italic and ");
        expect(firstItemHtml).toContain("<code>");
        expect(firstItemHtml).toContain("code");
        expect(firstItemHtml).toContain("</code>");
        expect(firstItemHtml).toContain("</em>");
    });

    test("Correctly displayed even when multiple formats are nested", async ({ page }) => {
        // Create data with lines parameter of prepareTestEnvironment
        await TestHelpers.prepareTestEnvironment(page, test.info(), [
            "This is [[bold and [/ italic and [-strikethrough] and `code`]]].",
        ]);

        // Wait a little for formatting to be applied
        await TestHelpers.waitForOutlinerItems(page);

        // Verify the HTML of the 2nd item (first item that is not the page title)
        const firstItemHtml = await page.locator(".outliner-item").nth(1).locator(".item-text").first().innerHTML();

        // Verify that the complex combination is displayed correctly
        expect(firstItemHtml).toContain("<strong>");
        expect(firstItemHtml).toContain("bold and ");
        expect(firstItemHtml).toContain("<em>");
        expect(firstItemHtml).toContain("italic and ");
        expect(firstItemHtml).toContain("<s>");
        expect(firstItemHtml).toContain("strikethrough");
        expect(firstItemHtml).toContain("</s>");
        expect(firstItemHtml).toContain("<code>");
        expect(firstItemHtml).toContain("code");
        expect(firstItemHtml).toContain("</code>");
        expect(firstItemHtml).toContain("</em>");
        expect(firstItemHtml).toContain("</strong>");
    });

    test("Combined formatting is displayed as plain text in the item with the cursor", async ({ page }) => {
        // Create data with lines parameter of prepareTestEnvironment
        await TestHelpers.prepareTestEnvironment(page, test.info(), [
            "This is [[bold and [/ italic and [-strikethrough] and `code`]]].",
        ]);

        // Wait a little for formatting to be applied
        await TestHelpers.waitForOutlinerItems(page);

        // Select the first item that is not the page title
        const item = page.locator(".outliner-item").nth(1);
        await item.locator(".item-content").click();

        // Wait for cursor to be visible
        await TestHelpers.waitForCursorVisible(page);

        // Verify the HTML of the item with the cursor
        const itemHtml = await page.locator(".outliner-item").nth(1).locator(".item-text").first().innerHTML();

        // Verify that control characters are displayed
        expect(itemHtml).toContain('<span class="control-char">[</span>');
        expect(itemHtml).toContain('<span class="control-char">/</span>');
        expect(itemHtml).toContain('<span class="control-char">-</span>');
        expect(itemHtml).toContain('<span class="control-char">`</span>');

        // Check text content as well
        const itemText = await page.locator(".outliner-item").nth(1).locator(".item-text").first().textContent();
        expect(itemText).toContain("This is [[bold and [/ italic and [-strikethrough] and `code`]]].");
    });
});
