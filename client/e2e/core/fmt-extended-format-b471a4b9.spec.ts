import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
/** @feature FMT-0003
 *  Title   : Extended format
 *  Source  : docs/client-features.yaml
 */

import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

test.describe("Extended format", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        await TestHelpers.prepareTestEnvironment(page, testInfo);
    });

    test("Links are displayed correctly", async ({ page }) => {
        // Select the first item (not the page title)
        await TestHelpers.waitForOutlinerItems(page);
        const firstItemId = await TestHelpers.getItemIdByIndex(page, 0);
        expect(firstItemId).not.toBeNull();

        const item = page.locator(`.outliner-item[data-item-id="${firstItemId}"]`);
        await item.locator(".item-content").click();

        // Delete existing text
        await page.keyboard.press("Control+A");
        await page.keyboard.press("Delete");
        await page.waitForTimeout(100);

        // Enter text containing a link (use insertText to enter special characters correctly)
        await page.keyboard.insertText("This is a [https://example.com] link");
        await page.waitForTimeout(200);

        // Create another item and move the cursor
        await page.keyboard.press("Enter");
        await page.keyboard.type("Another item");

        // Click on another item to move focus (to apply formatting)
        const secondItemId = await TestHelpers.getItemIdByIndex(page, 1);
        expect(secondItemId).not.toBeNull();
        await page.locator(`.outliner-item[data-item-id="${secondItemId}"]`).locator(".item-content").click();

        // Wait for formatting to be applied (robust wait)
        await expect.poll(async () => {
            return await page.locator(
                `.outliner-item[data-item-id="${firstItemId}"] .item-content > .item-text`,
            ).first().innerHTML();
        }).toContain('<a href="https://example.com"');
    });

    test("Quotes are displayed correctly", async ({ page }) => {
        // Select the first item (not the page title)
        await TestHelpers.waitForOutlinerItems(page);
        const firstItemId = await TestHelpers.getItemIdByIndex(page, 0);
        expect(firstItemId).not.toBeNull();

        const item = page.locator(`.outliner-item[data-item-id="${firstItemId}"]`);
        await item.locator(".item-content").click();

        // Delete existing text
        await page.keyboard.press("Control+A");
        await page.keyboard.press("Delete");
        await page.waitForTimeout(100);

        // Enter text containing a quote
        await page.keyboard.insertText("> This is a quote");
        await page.waitForTimeout(200);

        // Create another item and move the cursor
        await page.keyboard.press("Enter");
        await page.keyboard.type("Another item");

        // Click on another item to move focus (to apply formatting)
        const secondItemId2 = await TestHelpers.getItemIdByIndex(page, 1);
        expect(secondItemId2).not.toBeNull();
        await page.locator(`.outliner-item[data-item-id="${secondItemId2}"]`).locator(".item-content").click();

        // Wait for formatting to be applied
        await expect.poll(async () => {
            return await page.locator(
                `.outliner-item[data-item-id="${firstItemId}"] .item-content > .item-text`,
            ).first().innerHTML();
        }).toContain("This is a quote");
    });

    test("Complex formats are displayed correctly", async ({ page }) => {
        // Select the first item (not the page title)
        await TestHelpers.waitForOutlinerItems(page);
        const firstItemId = await TestHelpers.getItemIdByIndex(page, 0);
        expect(firstItemId).not.toBeNull();

        const item = page.locator(`.outliner-item[data-item-id="${firstItemId}"]`);
        await item.locator(".item-content").click();

        // Delete existing text
        await page.keyboard.press("Control+A");
        await page.keyboard.press("Delete");
        await page.waitForTimeout(100);

        // Enter text containing complex formatting (list and quote separately)
        await page.keyboard.insertText("- [[Bold]] and [/ Italic] [https://example.com] link");
        await page.waitForTimeout(200);

        // Create another item and move the cursor
        await page.keyboard.press("Enter");
        await page.keyboard.type("Another item");

        // Click on another item to move focus (to apply formatting)
        const secondItemId3 = await TestHelpers.getItemIdByIndex(page, 1);
        expect(secondItemId3).not.toBeNull();
        await page.locator(`.outliner-item[data-item-id="${secondItemId3}"]`).locator(".item-content").click();

        // Wait for formatting to be applied
        await expect.poll(async () => {
            const html = await page.locator(
                `.outliner-item[data-item-id="${firstItemId}"] .item-content > .item-text`,
            ).first().innerHTML();
            return html.includes("<strong>") && html.includes("<em>") && html.includes('<a href="https://example.com"');
        }).toBe(true);
    });

    test("Extended formats are also displayed as plain text in the item with the cursor", async ({ page }) => {
        // Select the first item (not the page title)
        const firstItemId = await TestHelpers.getItemIdByIndex(page, 0);
        expect(firstItemId).not.toBeNull();

        const item = page.locator(`.outliner-item[data-item-id="${firstItemId}"]`);
        await item.locator(".item-content").click();

        // Delete existing text
        await page.keyboard.press("Control+A");
        await page.keyboard.press("Delete");
        await page.waitForTimeout(100);

        // Enter text containing complex formatting
        const complexText = "- [[Bold]] and [/Italic] [https://example.com] link";
        await page.keyboard.insertText(complexText);
        await page.waitForTimeout(200);

        // Check the text of the item with the cursor
        const itemText = await page.locator(`.outliner-item[data-item-id="${firstItemId}"] .item-content > .item-text`)
            .first().textContent();

        // Check that the text contains control characters (check if it is included, not an exact match)
        expect(itemText).toContain("Bold");
        expect(itemText).toContain("Italic");
        expect(itemText).toContain("https://example.com");
        expect(itemText).toContain("link");

        // Check that the entered text is not displayed as HTML
        const itemHtml = await page.locator(`.outliner-item[data-item-id="${firstItemId}"] .item-content > .item-text`)
            .first().innerHTML();
        expect(itemHtml).toContain('class="control-char"'); // Check that control characters are displayed with a special class
    });
});
