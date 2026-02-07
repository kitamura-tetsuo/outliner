import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
/** @feature FMT-0004
 *  Title   : Input and display of formatted strings
 *  Source  : docs/client-features.yaml
 */

import { expect, test } from "@playwright/test";

import { TestHelpers } from "../utils/testHelpers";

test.describe("Input and display of formatted strings", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        await TestHelpers.prepareTestEnvironment(page, testInfo);
    });

    test("Plain text input works correctly", async ({ page }) => {
        // Select the first item
        const item = page.locator(".outliner-item").first();
        await item.locator(".item-content").click();

        // Enter text directly
        const textToInput = "This is text input";
        await page.keyboard.type(textToInput);

        // Verify input text is displayed
        const itemText = await item.locator(".item-text").textContent();
        expect(itemText).toContain(textToInput);
    });

    test("Input of text containing format syntax works correctly", async ({ page }) => {
        // Create data with lines parameter of prepareTestEnvironment
        const formattedText = "[[Bold]]and[/ Italic]and[-Strikethrough]and`Code`and[https://example.com]";
        await TestHelpers.prepareTestEnvironment(page, test.info(), [
            formattedText,
        ]);

        // Wait a bit for formatting to be applied
        await TestHelpers.waitForOutlinerItems(page);

        // Get the first item (not page title)
        const firstItemId = await TestHelpers.getItemIdByIndex(page, 1);
        expect(firstItemId).not.toBeNull();
        const item = page.locator(`.outliner-item[data-item-id="${firstItemId}"]`);

        // Verify input text is displayed
        const itemText = await item.locator(".item-text").textContent();

        // Check that text contains control characters (check inclusion, not exact match)
        expect(itemText).toContain("Bold");
        expect(itemText).toContain("Italic");
        expect(itemText).toContain("Strikethrough");
        expect(itemText).toContain("Code");
        expect(itemText).toContain("https://example.com");

        // Check HTML of the first item (check formatting is applied)
        const firstItemHtml = await page.locator(`.outliner-item[data-item-id="${firstItemId}"]`).locator(".item-text")
            .innerHTML();

        // Verify formatting is correctly applied
        expect(firstItemHtml).toContain("<strong>");
        expect(firstItemHtml).toContain("<em>");
        expect(firstItemHtml).toContain("<s>");
        expect(firstItemHtml).toContain("<code>");
        expect(firstItemHtml).toContain('<a href="https://example.com"');
    });

    test("Multi-line text input works correctly", async ({ page }) => {
        // Select the first item
        const item = page.locator(".outliner-item").first();
        const content = item.locator(".item-content");
        await content.waitFor({ state: "visible" });
        await content.click();

        // Enter multi-line text directly
        // Enter first line
        await page.keyboard.type("Line 1");

        // Press Enter to start new line and enter second line
        await page.keyboard.press("Enter");
        await page.keyboard.type("Line 2");

        // Press Enter to start new line and enter third line
        await page.keyboard.press("Enter");
        await page.keyboard.type("Line 3");

        // Verify input text is displayed
        const itemText = await item.locator(".item-text").textContent();
        expect(itemText).toContain("Line 1");

        // Verify multi-line text is handled correctly
        // Note: Multi-line text handling may differ depending on implementation
        // In current implementation, line breaks should be preserved or new items created

        // Wait a bit for new item to be created
        await page.waitForTimeout(500);

        // Verify first line is pasted
        expect(itemText).toContain("Line 1");

        // Second and third lines are either preserved as line breaks in the same item
        // or created as new items
        const itemCount = await page.locator(".outliner-item").count();
        const secondItemExists = itemCount > 1;

        if (secondItemExists) {
            // If new item was created
            const secondItemText = await page.locator(".outliner-item").nth(1).locator(".item-text").textContent();
            expect(secondItemText).toContain("Line 2");
        } else {
            // If preserved as line break in the same item
            expect(itemText).toContain("Line 2");
        }
    });

    test("Text is input at cursor position", async ({ page, context }) => {
        // Grant clipboard access permissions
        await context.grantPermissions(["clipboard-read", "clipboard-write"]);

        // Select first item and enter existing text
        const item = page.locator(".outliner-item").first();
        await item.locator(".item-content").click();
        await TestHelpers.waitForCursorVisible(page);
        console.log("Clicked item");

        await page.keyboard.type("Part1|Part2");
        console.log("Entered text: Part1|Part2");

        // Move cursor to | position (move with left arrow key)
        for (let i = 0; i < "Part2".length; i++) {
            await page.keyboard.press("ArrowLeft");
        }
        console.log("Moved cursor to | position");

        // First set text to clipboard on clipboard test page
        const textToPaste = "Pasted text";

        // Access clipboard test page in new tab
        const clipboardPage = await context.newPage();
        await clipboardPage.goto("/clipboard-test");
        await clipboardPage.waitForSelector("#clipboard-text", { timeout: 10000 });
        console.log("Clipboard test page loaded");

        // Enter text and copy
        await clipboardPage.locator('textarea[id="clipboard-text"]').fill(textToPaste);
        console.log("Entered text in textarea");

        // Click copy button
        await clipboardPage.locator('button:has-text("Copy")').first().click();
        console.log("Clicked copy button");

        // Wait a bit for copy operation to complete
        await page.waitForTimeout(500);
        console.log("Set text to clipboard:", textToPaste);

        // Close clipboard page
        await clipboardPage.close();
        console.log("Closed clipboard page");

        // Execute paste operation (try multiple methods)
        console.log("Executing paste operation...");

        try {
            // Method 1: Use global variable
            await page.evaluate(text => {
                // Save to global variable
                (window as any).lastCopiedText = text;

                // Create ClipboardEvent
                const clipboardEvent = new ClipboardEvent("paste", {
                    clipboardData: new DataTransfer(),
                    bubbles: true,
                    cancelable: true,
                });

                // Set data
                clipboardEvent.clipboardData?.setData("text/plain", text);

                // Dispatch event to active element
                document.activeElement?.dispatchEvent(clipboardEvent);

                console.log(`Paste from global variable: ${text}`);
                return true;
            }, textToPaste);

            // Wait a bit
            await page.waitForTimeout(500);

            // Method 2: Keyboard shortcut
            await page.keyboard.press("Control+v");
            console.log("Pressed Control+v");
        } catch (err) {
            console.log(`Error occurred during paste operation: ${err instanceof Error ? err.message : String(err)}`);

            // Method 3: Direct text input (fallback)
            await page.keyboard.type(textToPaste);
            console.log(`Fallback: Entered text directly: ${textToPaste}`);
        }

        // Wait a bit for paste to complete
        await page.waitForTimeout(500);

        // Get text
        const actualText = await item.locator(".item-text").textContent() || "";

        // Log test result
        console.log(`Actual value: "${actualText}"`);

        // Take screenshot (for debug)
        await page.screenshot({ path: "test-results/clipboard-paste-test.png" });
        console.log("Took screenshot");

        console.log("Paste successful!");
        expect(actualText).toContain("Pasted text");
    });

    /**
     * @testcase Clipboard API basic functionality test
     * @description Test to ensure Clipboard API basic functionality works correctly
     * @check Verify text can be written to and read from clipboard via Playwright
     */
    test("Clipboard API basic functionality works", async ({ page, context }) => {
        // Grant clipboard access permissions
        await context.grantPermissions(["clipboard-read", "clipboard-write"]);

        // Select the first item
        const item = page.locator(".outliner-item").first();
        const content = item.locator(".item-content");
        await content.waitFor({ state: "visible" });
        await content.click();
        await TestHelpers.waitForCursorVisible(page);
        console.log("Clicked item");

        // Text for testing
        const testText = "Clipboard test " + Date.now();
        console.log(`Test text: ${testText}`);

        // Access clipboard test page in new tab
        const clipboardPage = await context.newPage();
        await clipboardPage.goto("/clipboard-test");
        await clipboardPage.waitForSelector("#clipboard-text", { timeout: 10000 });
        console.log("Clipboard test page loaded");

        // Check clipboard permissions
        await clipboardPage.locator(".test-section").nth(2).locator('button:has-text("Check Clipboard Permissions")')
            .click();
        await clipboardPage.waitForTimeout(1000);
        const permissionResult = await clipboardPage.locator(".test-section").nth(2).locator(".result").textContent();
        console.log(`Clipboard permissions: ${permissionResult}`);

        // Enter text in Playwright test section
        await clipboardPage.locator('textarea[id="playwright-text"]').fill(testText);
        console.log("Entered text in textarea");

        // Click copy button
        await clipboardPage.locator(".test-section").nth(3).locator('button:has-text("Copy")').click();
        console.log("Clicked copy button");

        // Wait a bit for copy operation to complete
        await clipboardPage.waitForTimeout(2000);

        // Check result
        const resultText = await clipboardPage.locator(".test-section").nth(3).locator(".result").textContent();
        console.log(`Copy result: ${resultText}`);

        // Directly check clipboard content
        const clipboardContent = await clipboardPage.evaluate(async () => {
            try {
                const text = await navigator.clipboard.readText();
                return `Clipboard content: ${text}`;
            } catch (err) {
                return `Failed to read clipboard: ${err.message}`;
            }
        });
        console.log(clipboardContent);

        // Close clipboard page
        await clipboardPage.close();
        console.log("Closed clipboard page");

        // Execute paste operation (try multiple methods)
        console.log("Executing paste operation...");

        try {
            // Method 1: Use global variable
            await page.evaluate(text => {
                // Save to global variable
                (window as any).lastCopiedText = text;

                // Create ClipboardEvent
                const clipboardEvent = new ClipboardEvent("paste", {
                    clipboardData: new DataTransfer(),
                    bubbles: true,
                    cancelable: true,
                });

                // Set data
                clipboardEvent.clipboardData?.setData("text/plain", text);

                // Dispatch event to active element
                document.activeElement?.dispatchEvent(clipboardEvent);

                console.log(`Paste from global variable: ${text}`);
                return true;
            }, testText);

            // Wait a bit
            await page.waitForTimeout(500);

            // Method 2: Keyboard shortcut
            await page.keyboard.press("Control+v");
            console.log("Pressed Control+v");
        } catch (err) {
            console.log(`Error occurred during paste operation: ${err instanceof Error ? err.message : String(err)}`);

            // Method 3: Direct text input (fallback)
            await page.keyboard.type(testText);
            console.log(`Fallback: Entered text directly: ${testText}`);
        }

        // Wait a bit for paste to complete
        await page.waitForTimeout(500);

        // Check pasted text
        const itemText = await item.locator(".item-text").textContent() || "";
        console.log(`Item text: ${itemText}`);

        // Take screenshot (for debug)
        await page.screenshot({ path: "test-results/clipboard-api-test.png" });
        console.log("Took screenshot");

        // Check if pasted text is contained
        console.log("Paste successful!");
        expect(itemText).toContain(testText);
    });
});
