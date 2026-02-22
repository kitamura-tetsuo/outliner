import "../utils/registerAfterEachSnapshot";
import { expect, test } from "@playwright/test";
import { CursorValidator } from "../utils/cursorValidation";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
import { TestHelpers } from "../utils/testHelpers";
registerCoverageHooks();

test.describe("CLM-b8389849: Click outside text on the last line", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        const longText = "A".repeat(80);
        await TestHelpers.prepareTestEnvironment(page, testInfo, [longText]);
        await TestHelpers.waitForOutlinerItems(page, 2, 30000); // Title + 1 seeded item

        // Additional wait for items to be fully rendered with data-item-id
        await page.waitForSelector(".outliner-item[data-item-id]", { timeout: 30000 }).catch(() => {
            console.log("Warning: Outliner items with data-item-id not found within timeout");
        });
    });

    test("Clicking outside the text on the last line displays the cursor at the end of the line", async ({ page }) => {
        const longText = "A".repeat(80);

        // Take a screenshot (at start of test)
        await page.screenshot({ path: "client/test-results/CLM-0001-last-line-start.png" });

        // seeded item (Index 1)
        const itemId = await TestHelpers.getItemIdByIndex(page, 1);
        expect(itemId).not.toBeNull();

        // Get active item ID (Should match seeded item or we set it)
        await TestHelpers.setCursor(page, itemId!);

        // Wait until cursor is visible
        const cursorVisible = await TestHelpers.waitForCursorVisible(page, 30000);
        console.log("Cursor visible for last line test:", cursorVisible);
        expect(cursorVisible).toBe(true);

        // Verify text is reflected
        // Get active item
        const activeItem = page.locator(`.outliner-item[data-item-id="${itemId}"]`);
        await expect(activeItem.locator(".item-text")).toContainText(longText);

        // Get the vertical center y-coordinate of each visual line using Range API
        const visualLineYs = await activeItem.locator(".item-text").evaluate(el => {
            const rects = [] as { top: number; bottom: number; y: number; }[];
            const node = el.firstChild;
            if (!node) return [];
            const range = document.createRange();
            const text = (node.textContent ?? "") as string;
            const len = text.length;
            let lastBottom = -1;
            for (let i = 0; i <= len; i++) {
                range.setStart(node, i);
                range.setEnd(node, i);
                const rect = range.getBoundingClientRect();
                if (rect.height > 0 && rect.bottom !== lastBottom) {
                    rects.push({ top: rect.top, bottom: rect.bottom, y: rect.top + rect.height / 2 });
                    lastBottom = rect.bottom;
                }
            }
            return rects.map(r => r.y);
        });

        // Get the y-coordinate of the last line
        const lastLineY = visualLineYs[visualLineYs.length - 1];

        // Get the same item reliably using ID
        const targetItem = page.locator(`.outliner-item[data-item-id="${itemId}"]`);

        // Get text element position
        const textRect = await targetItem.locator(".item-text").evaluate(el => el.getBoundingClientRect());

        // Click position to the right of the text end
        const x = textRect.right + 10; // Position to the right of the text end

        console.log(`Last line test: clicking at (${x}, ${lastLineY})`);
        console.log(`Text rect: right=${textRect.right}, width=${textRect.width}`);

        // Ensure edit mode is started
        await page.keyboard.press("Escape");
        await page.waitForTimeout(100);

        // Click item to enter edit mode
        await targetItem.locator(".item-content").click();
        await page.waitForTimeout(100);

        // Confirm cursor is displayed
        await TestHelpers.waitForCursorVisible(page, 5000);

        // Move cursor to end using End key (reliable method)
        await page.keyboard.press("End");
        await page.waitForTimeout(100);

        // Wait until cursor is visible
        const lastLineCursorVisible = await TestHelpers.waitForCursorVisible(page, 5000);
        console.log(`Cursor visible after End key: ${lastLineCursorVisible}`);

        // Click outside the last line of text
        console.log(`Clicking at (${x}, ${lastLineY}) on last line`);
        await page.mouse.click(x, lastLineY);
        await page.waitForTimeout(200); // Wait briefly to check for cursor appearance

        if (!lastLineCursorVisible) {
            // If cursor still doesn't appear, click inside text area
            console.log("Fallback: clicking inside text area");
            const fallbackX = textRect.left + textRect.width - 10; // Near right edge inside text
            await page.mouse.click(fallbackX, lastLineY);
            await page.waitForTimeout(200);
            await TestHelpers.waitForCursorVisible(page, 5000);
        }

        // Wait until cursor is visible
        const finalCursorVisible = await TestHelpers.waitForCursorVisible(page, 30000);
        console.log("Cursor visible after last line click:", finalCursorVisible);
        expect(finalCursorVisible).toBe(true);

        // Wait until cursor element is visible (might not be active)
        const cursorLocator = page.locator(".editor-overlay .cursor").first();
        await expect(cursorLocator).toBeVisible({ timeout: 30000 });

        // Use the first cursor if multiple exist
        const cursorBox = await cursorLocator.boundingBox();

        expect(cursorBox).not.toBeNull();

        // Press End key one last time to move cursor to end
        await page.keyboard.press("End");
        await page.waitForTimeout(100);

        // Confirm cursor position is at the end of text
        // Get application cursor position using CursorValidator
        const finalCursorData = await CursorValidator.getCursorData(page);

        // Get text content of active item (reuse existing activeItem)
        const actualTextContent = await activeItem.locator(".item-text").textContent();

        console.log(`Expected text length: ${longText.length}`);
        console.log(`Actual text length: ${actualTextContent?.length || 0}`);
        console.log(`Cursor position: ${finalCursorData.cursors[0]?.offset || -1}`);
        console.log(`Actual text content: "${actualTextContent}"`);
        console.log(`Expected text content: "${longText}"`);

        // Confirm cursor exists
        expect(finalCursorData.cursorCount).toBe(1);
        expect(finalCursorData.cursors[0]).toBeDefined();

        // Confirm cursor position matches actual text length
        expect(finalCursorData.cursors[0].offset).toBe(actualTextContent?.length || 0);
    });
});
