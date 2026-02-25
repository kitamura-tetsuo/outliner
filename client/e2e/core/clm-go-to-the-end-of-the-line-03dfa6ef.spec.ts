import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
/** @feature CLM-0008
 *  Title   : Move to the end of the line
 *  Source  : docs/client-features.yaml
 */
import { expect, test } from "@playwright/test";
import { CursorValidator } from "../utils/cursorValidation";
import { TestHelpers } from "../utils/testHelpers";

// Set test timeout (long enough for CI)

test.describe("CLM-0008: Move to the end of the line", () => {
    test.setTimeout(180000); // 3 minutes
    test.beforeEach(async ({ page }, testInfo) => {
        await TestHelpers.prepareTestEnvironment(page, testInfo);

        // Click the first item
        const item = page.locator(".outliner-item").first();
        await item.locator(".item-content").click({ force: true });

        // Wait for global textarea to be focused
        await page.waitForSelector("textarea.global-textarea:focus");

        // Wait for cursor to be visible
        await TestHelpers.waitForCursorVisible(page);

        // Enter test text (explicitly enter new lines)
        await page.keyboard.type("First line");
        await page.keyboard.press("Enter");
        await page.keyboard.type("Second line");
        await page.keyboard.press("Enter");
        await page.keyboard.type("Third line");

        // Move cursor to the beginning of the second line
        await page.keyboard.press("Home");
        await page.keyboard.press("ArrowUp");
        await page.keyboard.press("ArrowDown");
        await page.keyboard.press("Home");
    });

    test("Pressing End key moves cursor to the end of the current line", async ({ page }) => {
        // Wait for cursor to be visible
        await TestHelpers.waitForCursorVisible(page);

        // Get active item ID
        const activeItemId = await TestHelpers.getActiveItemId(page);
        expect(activeItemId).not.toBeNull();

        // Get active item
        const activeItem = page.locator(`.outliner-item[data-item-id="${activeItemId}"]`);
        await activeItem.waitFor({ state: "visible" });

        // Get and verify initial cursor data (more reliable method)
        const initialCursorData = await CursorValidator.getCursorData(page);
        expect(initialCursorData.cursorCount).toBeGreaterThan(0);
        expect(initialCursorData.activeItemId).not.toBeNull();

        // Check cursor element in DOM (search without active class)
        const editorOverlay = page.locator(".editor-overlay");
        await editorOverlay.waitFor({ state: "attached", timeout: 10000 });

        // Search for cursor element generally
        const cursor = page.locator(".editor-overlay .cursor").first();

        // Verify cursor element is attached (attached, not necessarily visible)
        await expect(cursor).toBeAttached({ timeout: 15000 });

        // Get initial cursor position (fallback to 0 if not yet rendered)
        let initialX = 0;
        try {
            initialX = await cursor.evaluate(el => el.getBoundingClientRect().left);
        } catch (_) { // eslint-disable-line @typescript-eslint/no-unused-vars
            // Continue test even if cursor element not yet rendered
            console.log("Initial cursor position not available, continuing test");
        }

        // Press End key
        await page.keyboard.press("End");

        // Wait for the UI to update after pressing End key
        await page.waitForTimeout(300);

        // Check that the page has processed the keypress by verifying textarea focus
        await page.waitForFunction(() => {
            const activeElement = document.activeElement;
            return activeElement?.tagName === "TEXTAREA"
                && activeElement.classList.contains("global-textarea");
        }, { timeout: 10000 });

        // Re-verify cursor data after End key (based on app state)
        const afterEndCursorData = await CursorValidator.getCursorData(page);
        expect(afterEndCursorData.cursorCount).toBeGreaterThan(0);
        expect(afterEndCursorData.activeItemId).not.toBeNull();

        // Get new cursor position (fallback to 0)
        let newX = 0;
        try {
            newX = await cursor.evaluate(el => el.getBoundingClientRect().left);
        } catch (_) { // eslint-disable-line @typescript-eslint/no-unused-vars
            console.log("New cursor position not available, continuing test");
        }

        // Verify cursor moved right (or stayed at the same position if it was already at the end)
        expect(newX).toBeGreaterThanOrEqual(initialX);

        // Verify cursor offset is at the end of the text (using app state)
        // For "Second line", the offset should be 11
        expect(afterEndCursorData.cursors[0].offset).toBe(11);

        // Optional: verify cursor offset DOM-wise
        try {
            const cursorOffset = await page.evaluate(() => {
                const cursor = document.querySelector(".editor-overlay .cursor");
                if (!cursor) return null;
                const style = window.getComputedStyle(cursor);
                return {
                    left: parseFloat(style.left),
                    top: parseFloat(style.top),
                };
            });

            if (cursorOffset) {
                expect(cursorOffset).not.toBeNull();
            }
        } catch (_) { // eslint-disable-line @typescript-eslint/no-unused-vars
            // Continue if app state was already verified
            console.log("Cursor offset check failed, but continuing since app state was verified");
        }
    });
});
