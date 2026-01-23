import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
/** @feature SLR-0002
 *  Title   : Shift + Arrow Exhaustive Coverage
 *  Description: Exhaustive tests for Shift + Arrow key operations to detect abnormal cursor/selection behavior
 */
import { expect, test } from "@playwright/test";
import { CursorValidator } from "../utils/cursorValidation";
import { TestHelpers } from "../utils/testHelpers";

test.describe("SLR-0002: Shift + Arrow Exhaustive Coverage", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        await TestHelpers.prepareTestEnvironment(page, testInfo, [
            "First line of text for testing",
            "Second line of text for testing",
            "Third line of text for testing"
        ]);

        // Move to start of first item
        const item = page.locator(".outliner-item").first();
        await item.waitFor({ state: "visible", timeout: 10000 });
        await item.locator(".item-content").click({ force: true });

        // Wait for cursor visible
        await TestHelpers.waitForCursorVisible(page);

        // Focus on global textarea
        await TestHelpers.focusGlobalTextarea(page);

        // Ensure cursor is at start
        await page.keyboard.press("Home");
        // Ensure we are at the very top
        await page.keyboard.press("ArrowUp");
        await page.keyboard.press("ArrowUp");
    });

    test("Shift + Right Exhaustive (Abnormal Cursor Check)", async ({ page }) => {
        // Initial check
        await CursorValidator.assertCursorCount(page, 1);

        // Loop Shift+Right
        for (let i = 0; i < 10; i++) {
             await page.keyboard.press("Shift+ArrowRight");
             await page.waitForTimeout(100); // small delay to let UI update

             // Check cursor count is STRICTLY 1
             await CursorValidator.assertCursorCount(page, 1);

             // Check selection exists
             const selectionText = await page.evaluate(() => {
                const store = (window as any).editorOverlayStore;
                return store ? store.getSelectedText() : "";
             });
             // Selection length should be at least i+1 because we started at 0 selection and press Shift+Right
             expect(selectionText.length).toBeGreaterThanOrEqual(i + 1);
        }
    });

    test("Shift + Left Exhaustive", async ({ page }) => {
        // Move to middle of line (e.g. 10 chars in)
        for (let i = 0; i < 10; i++) {
            await page.keyboard.press("ArrowRight");
        }

        await CursorValidator.assertCursorCount(page, 1);

        // Loop Shift+Left
        for (let i = 0; i < 5; i++) {
             await page.keyboard.press("Shift+ArrowLeft");
             await page.waitForTimeout(100);

             await CursorValidator.assertCursorCount(page, 1);

             const selectionText = await page.evaluate(() => {
                const store = (window as any).editorOverlayStore;
                return store ? store.getSelectedText() : "";
             });
             // Selection grows
             expect(selectionText.length).toBeGreaterThanOrEqual(i + 1);
        }
    });

    test("Mixed Direction (Down then Right)", async ({ page }) => {
        await CursorValidator.assertCursorCount(page, 1);

        // Shift + Down
        await page.keyboard.press("Shift+ArrowDown");
        await page.waitForTimeout(200);

        await CursorValidator.assertCursorCount(page, 1);

        // Verify multiple lines selected
        let selectionText = await page.evaluate(() => {
            const store = (window as any).editorOverlayStore;
            return store ? store.getSelectedText() : "";
        });
        // Check for presence of newline or multiple items selected
        // Note: getSelectedText might return text with newlines if multi-item selection
        expect(selectionText).toContain("\n");

        // Shift + Right (extend)
        await page.keyboard.press("Shift+ArrowRight");
        await page.keyboard.press("Shift+ArrowRight");
        await page.waitForTimeout(200);

        await CursorValidator.assertCursorCount(page, 1);

        let newSelectionText = await page.evaluate(() => {
            const store = (window as any).editorOverlayStore;
            return store ? store.getSelectedText() : "";
        });
        expect(newSelectionText.length).toBeGreaterThan(selectionText.length);
    });

    test("Selection Reversal (Right then Left)", async ({ page }) => {
        await CursorValidator.assertCursorCount(page, 1);

        // Expand
        for (let i = 0; i < 5; i++) {
            await page.keyboard.press("Shift+ArrowRight");
        }
        await page.waitForTimeout(100);

        // Contract
        for (let i = 0; i < 5; i++) {
            await page.keyboard.press("Shift+ArrowLeft");
        }
        await page.waitForTimeout(100);

        await CursorValidator.assertCursorCount(page, 1);

        const selectionText = await page.evaluate(() => {
            const store = (window as any).editorOverlayStore;
            return store ? store.getSelectedText() : "";
        });
        // Should be empty or length 0
        expect(selectionText.length).toBe(0);
    });
});
