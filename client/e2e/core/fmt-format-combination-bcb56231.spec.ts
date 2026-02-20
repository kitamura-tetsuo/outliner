import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
/** @feature FMT-0002
 *  Title   : Format Combination
 *  Source  : docs/client-features.yaml
 */

import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

test.describe("Format Combination", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        await TestHelpers.prepareTestEnvironment(page, testInfo);
    });

    test("Combination of bold and italic is displayed correctly", async ({ page }) => {
        // Create data using the lines parameter of prepareTestEnvironment
        await TestHelpers.prepareTestEnvironment(page, test.info(), [
            "This is a [[bold and [/ italic] combination]]",
        ]);

        // Wait a bit for the format to be applied
        await TestHelpers.waitForOutlinerItems(page);

        // Get the second item (the first item that is not the page title)
        const firstItem = page.locator(".outliner-item").nth(1);

        // Get the HTML of the .item-text element
        const firstItemHtml = await firstItem.locator(".item-text").first().innerHTML();

        // Confirm that the combination of bold and italic is displayed correctly
        expect(firstItemHtml).toContain("<strong>");
        expect(firstItemHtml).toContain("bold and ");
        expect(firstItemHtml).toContain("<em>");
        expect(firstItemHtml).toContain("italic");
        expect(firstItemHtml).toContain("</em>");
        expect(firstItemHtml).toContain(" combination");
        expect(firstItemHtml).toContain("</strong>");
    });

    test("Combination of bold and strikethrough is displayed correctly", async ({ page }) => {
        // Create data using the lines parameter of prepareTestEnvironment
        await TestHelpers.prepareTestEnvironment(page, test.info(), [
            "This is a [[bold and [-strikethrough] combination]]",
        ]);

        // Wait a bit for the format to be applied
        await TestHelpers.waitForOutlinerItems(page);

        // Check the HTML of the second item (the first item that is not the page title)
        const secondItem = page.locator(".outliner-item").nth(1);
        await secondItem.waitFor({ state: "visible" });
        const firstItemHtml = await secondItem.locator(".item-text").first().innerHTML();

        // Confirm that the combination of bold and strikethrough is displayed correctly
        expect(firstItemHtml).toContain("<strong>");
        expect(firstItemHtml).toContain("bold and ");
        expect(firstItemHtml).toContain("<s>");
        expect(firstItemHtml).toContain("strikethrough");
        expect(firstItemHtml).toContain("</s>");
        expect(firstItemHtml).toContain(" combination");
        expect(firstItemHtml).toContain("</strong>");
    });

    test("Combination of italic and code is displayed correctly", async ({ page }) => {
        // Create data using the lines parameter of prepareTestEnvironment
        await TestHelpers.prepareTestEnvironment(page, test.info(), [
            "This is a [/ italic and `code` combination]",
        ]);

        // Wait a bit for the format to be applied
        await TestHelpers.waitForOutlinerItems(page);

        // Check the HTML of the second item (the first item that is not the page title)
        const firstItem = page.locator(".outliner-item").nth(1);
        await firstItem.waitFor({ state: "visible" });
        // Wait for specific formatting to appear to handle hydration/rendering delays
        await firstItem.locator("em").waitFor({ state: "attached", timeout: 5000 }).catch(() => {});

        const firstItemHtml = await firstItem.locator(".item-text").first().innerHTML();

        // Confirm that the combination of italic and code is displayed correctly
        expect(firstItemHtml).toContain("<em>");
        expect(firstItemHtml).toContain("italic and ");
        expect(firstItemHtml).toContain("<code>");
        expect(firstItemHtml).toContain("code");
        expect(firstItemHtml).toContain("</code>");
        expect(firstItemHtml).toContain(" combination");
        expect(firstItemHtml).toContain("</em>");
    });

    test("Correctly displayed even when multiple formats are nested", async ({ page }) => {
        // Create data using the lines parameter of prepareTestEnvironment
        await TestHelpers.prepareTestEnvironment(page, test.info(), [
            "This is a [[bold and [/ italic and [-strikethrough] and `code`]]]",
        ]);

        // Wait a bit for the format to be applied
        await TestHelpers.waitForOutlinerItems(page);

        // Check the HTML of the second item (the first item that is not the page title)
        const firstItemHtml = await page.locator(".outliner-item").nth(1).locator(".item-text").first().innerHTML();

        // Confirm that the complex combination is displayed correctly
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

    test("Combined format is also displayed as plain text in the item with the cursor", async ({ page }) => {
        // Create data using the lines parameter of prepareTestEnvironment
        await TestHelpers.prepareTestEnvironment(page, test.info(), [
            "This is a [[bold and [/ italic and [-strikethrough] and `code`]]]",
        ]);

        // Wait a bit for the format to be applied
        await TestHelpers.waitForOutlinerItems(page);

        // Select the first item that is not the page title
        const item = page.locator(".outliner-item").nth(1);
        await item.locator(".item-content").click();

        // Wait for the cursor to appear
        await TestHelpers.waitForCursorVisible(page);

        // Check the HTML of the item with the cursor
        const itemHtml = await page.locator(".outliner-item").nth(1).locator(".item-text").first().innerHTML();

        // Confirm that control characters are displayed
        expect(itemHtml).toContain('<span class="control-char">[</span>');
        expect(itemHtml).toContain('<span class="control-char">/</span>');
        expect(itemHtml).toContain('<span class="control-char">-</span>');
        expect(itemHtml).toContain('<span class="control-char">`</span>');

        // Confirm text content as well
        const itemText = await page.locator(".outliner-item").nth(1).locator(".item-text").first().textContent();
        expect(itemText).toContain("This is a [[bold and [/ italic and [-strikethrough] and `code`]]]");
    });
});
