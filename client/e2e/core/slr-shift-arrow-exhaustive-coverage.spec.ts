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
        await TestHelpers.seedProjectAndNavigate(page, testInfo, [
            "First line of text for testing",
            "Second line of text for testing",
            "Third line of text for testing",
        ]);

        // Index 0 is the page title; start at the first actual outline text item.
        await TestHelpers.waitForOutlinerItems(page, 4, 10000);
        const firstTextItemId = await TestHelpers.getItemIdByIndex(page, 1);
        expect(firstTextItemId).not.toBeNull();
        await TestHelpers.setCursor(page, firstTextItemId!, 0);
        await TestHelpers.ensureCursorReady(page);
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
                const store = (globalThis as any).editorOverlayStore;
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
                const store = (globalThis as any).editorOverlayStore;
                return store ? store.getSelectedText() : "";
            });
            // Selection grows
            expect(selectionText.length).toBeGreaterThanOrEqual(i + 1);
        }
    });

    test("Mixed Direction (Down then Right)", async ({ page }) => {
        await CursorValidator.assertCursorCount(page, 1);
        const firstTextItemId = await TestHelpers.getItemIdByIndex(page, 1);
        const secondTextItemId = await TestHelpers.getItemIdByIndex(page, 2);
        expect(firstTextItemId).not.toBeNull();
        expect(secondTextItemId).not.toBeNull();

        // Shift + Down
        await page.keyboard.press("Shift+ArrowDown");
        await page.waitForTimeout(200);

        await CursorValidator.assertCursorCount(page, 1);

        const selectionAfterDown = await page.evaluate(() => {
            const store = (globalThis as any).editorOverlayStore;
            const selection = store ? Object.values<any>(store.selections)[0] : undefined;
            return {
                start: selection?.start,
                end: selection?.end,
                text: store ? store.getSelectedText() : "",
            };
        });

        // Reaching offset 0 of the next item spans items, but selects no text from it.
        expect(selectionAfterDown).toEqual({
            start: { kind: "text", itemId: firstTextItemId, offset: 0 },
            end: { kind: "text", itemId: secondTextItemId, offset: 0 },
            text: "First line of text for testing",
        });

        // Shift + Right extends into the second item, which now contributes text.
        await page.keyboard.press("Shift+ArrowRight");
        await page.waitForTimeout(200);

        await CursorValidator.assertCursorCount(page, 1);

        const selectionAfterFirstRight = await page.evaluate(() => {
            const store = (globalThis as any).editorOverlayStore;
            const selection = store ? Object.values<any>(store.selections)[0] : undefined;
            return {
                end: selection?.end,
                text: store ? store.getSelectedText() : "",
            };
        });
        expect(selectionAfterFirstRight).toEqual({
            end: { kind: "text", itemId: secondTextItemId, offset: 1 },
            text: "First line of text for testing\nS",
        });

        await page.keyboard.press("Shift+ArrowRight");
        await page.waitForTimeout(200);

        const selectionAfterSecondRight = await page.evaluate(() => {
            const store = (globalThis as any).editorOverlayStore;
            const selection = store ? Object.values<any>(store.selections)[0] : undefined;
            return {
                end: selection?.end,
                text: store ? store.getSelectedText() : "",
            };
        });
        expect(selectionAfterSecondRight).toEqual({
            end: { kind: "text", itemId: secondTextItemId, offset: 2 },
            text: "First line of text for testing\nSe",
        });
    });
});
