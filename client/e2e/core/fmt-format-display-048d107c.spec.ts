import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
/** @feature FMT-0001
 *  Title   : Format Display
 *  Source  : docs/client-features.yaml
 */

import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

test.describe("Format Display", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        await TestHelpers.prepareTestEnvironment(page, testInfo);
    });

    test("Formatted content is displayed in items without cursor", async ({ page }) => {
        // Select the first item
        const item = page.locator(".outliner-item").first();
        await item.locator(".item-content").click();

        // Wait for cursor visibility
        await TestHelpers.waitForCursorVisible(page);

        // Type text
        await page.keyboard.type("This is [[bold]] text");

        // Create another item and move cursor
        await page.keyboard.press("Enter");
        await page.keyboard.type("Another item");

        // Wait for format application
        await page.waitForTimeout(300);

        // Check HTML of the first item
        const firstItemHtml = await page.locator(".outliner-item").first().locator(".item-text").innerHTML();

        // Check formatted HTML (control characters hidden, format applied)
        expect(firstItemHtml).toContain("<strong>bold</strong>");
    });

    test("Raw content is displayed in items with cursor", async ({ page }) => {
        // Select the first item
        const item = page.locator(".outliner-item").first();
        const content = item.locator(".item-content");
        await content.waitFor({ state: "visible" });
        await content.click();

        // Wait for cursor visibility
        await TestHelpers.waitForCursorVisible(page);

        // Type text
        await page.keyboard.type("This is [[bold]] text");

        // Check text of the item with cursor
        const itemText = await page.locator(".outliner-item").first().locator(".item-text").textContent();

        // Check that raw text is displayed (including control characters)
        // Note: In actual implementation, it might be interpreted as internal link, so check partial match
        expect(itemText).toContain("This is");
        expect(itemText).toContain("bold");
        expect(itemText).toContain("text");

        // Check that control characters are displayed
        const itemHtml = await page.locator(".outliner-item").first().locator(".item-text").innerHTML();
        // Note: Check partial match as control char display might vary
        expect(itemHtml).toContain('class="control-char"');
    });

    test("Bold format ([[text]]) is visually displayed as bold", async ({ page }) => {
        // Select the first item
        const item = page.locator(".outliner-item").first();
        const content = item.locator(".item-content");
        await content.waitFor({ state: "visible" });
        await content.click();

        // Wait for cursor visibility
        await TestHelpers.waitForCursorVisible(page);

        // Type text
        await page.keyboard.type("This is [[bold]] text");

        // Create another item and move cursor
        await page.keyboard.press("Enter");
        await page.keyboard.type("Another item");

        // Wait for format application
        await page.waitForTimeout(300);

        // Check HTML of the first item
        const firstItemHtml = await page.locator(".outliner-item").first().locator(".item-text").innerHTML();

        // Check that bold format is applied
        expect(firstItemHtml).toContain("<strong>bold</strong>");
    });

    test("Italic format ([/ text]) is visually displayed as italic", async ({ page }) => {
        // Create data with prepareTestEnvironment
        await TestHelpers.prepareTestEnvironment(page, test.info(), [
            "This is [/ italic] text",
        ]);

        // Wait for item loading
        await page.waitForTimeout(2000);

        // Check HTML of the seeded item (index 0 or 1)
        const allItems = await page.locator(".outliner-item[data-item-id] .item-text").all();
        let foundItalic = false;
        for (const item of allItems) {
            const html = await item.innerHTML();
            if (html.includes("<em>italic</em>")) {
                foundItalic = true;
                break;
            }
        }

        // Check that italic format is applied
        expect(foundItalic).toBe(true);
    });

    test("Strikethrough format ([- text]) is visually displayed with strikethrough", async ({ page }) => {
        // Select the first item
        await TestHelpers.waitForOutlinerItems(page);
        const item = page.locator(".outliner-item").first();
        await item.locator(".item-content").click();

        // Wait for cursor visibility
        await TestHelpers.waitForCursorVisible(page);

        // Type text
        await page.keyboard.type("This is [-strikethrough] text");

        // Create another item and move cursor
        await page.keyboard.press("Enter");
        await page.keyboard.type("Another item");

        // Wait for format application
        await page.waitForTimeout(300);

        // Check HTML of the first item
        const firstItemHtml = await page.locator(".outliner-item").first().locator(".item-text").innerHTML();

        // Check that strikethrough format is applied
        expect(firstItemHtml).toContain("<s>strikethrough</s>");
    });

    test("Code format (`text`) is visually displayed as code", async ({ page }) => {
        // Select the first item
        const item = page.locator(".outliner-item").first();
        const content = item.locator(".item-content");
        await content.waitFor({ state: "visible" });
        await content.click();

        // Wait for cursor visibility
        await TestHelpers.waitForCursorVisible(page);

        // Type text
        await page.keyboard.type("This is `code` text");

        // Create another item and move cursor
        await page.keyboard.press("Enter");
        await page.keyboard.type("Another item");

        // Wait for format application
        await page.waitForTimeout(300);

        // Check HTML of the first item
        const firstItemHtml = await page.locator(".outliner-item").first().locator(".item-text").innerHTML();

        // Check that code format is applied
        expect(firstItemHtml).toContain("<code>code</code>");
    });

    test("Clicking an item reveals plain text", async ({ page }) => {
        // Select the first item
        const item = page.locator(".outliner-item").first();
        const content = item.locator(".item-content");
        await content.waitFor({ state: "visible" });
        await content.click();

        // Wait for cursor visibility
        await TestHelpers.waitForCursorVisible(page);

        // Type text
        await page.keyboard.type("This is [[bold]] text");

        // Create another item and move cursor
        await page.keyboard.press("Enter");
        await page.keyboard.type("Another item");

        // Wait for format application
        await page.waitForTimeout(300);

        // Check HTML of the first item (formatted)
        const firstItemHtml = await page.locator(".outliner-item").first().locator(".item-text").innerHTML();
        expect(firstItemHtml).toContain("<strong>bold</strong>");

        // Click the first item
        await page.locator(".outliner-item").first().locator(".item-content").click();

        // Wait for cursor visibility
        await TestHelpers.waitForCursorVisible(page);

        // Check HTML after click (control characters visible)
        const afterClickHtml = await page.locator(".outliner-item").first().locator(".item-text").innerHTML();

        // Note: Check partial match as control char display might vary
        expect(afterClickHtml).toContain('class="control-char"');

        // Check text of the item with cursor
        const itemText = await page.locator(".outliner-item").first().locator(".item-text").textContent();

        // Check that raw text is displayed (including control characters)
        expect(itemText).toContain("This is");
        expect(itemText).toContain("bold");
        expect(itemText).toContain("text");
    });
});
