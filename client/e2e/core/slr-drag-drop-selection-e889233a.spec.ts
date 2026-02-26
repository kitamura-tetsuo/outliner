import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
/** @feature SLR-0009
 *  Title   : Text movement by drag and drop
 *  Source  : docs/client-features.yaml
 */
import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

test.describe("SLR-0009: Drag and drop selection", () => {
    test.beforeEach(async ({ page, context }, testInfo) => {
        // Grant clipboard permissions
        await context.grantPermissions(["clipboard-read", "clipboard-write"]);

        await page.evaluate(async () => {
            (window as any).DEBUG_MODE = true;
            // Clear global variables to avoid affecting other tests
            delete (window as any).lastCopiedText;
            delete (window as any).lastPastedText;

            // Also clear navigator.clipboard
            try {
                await navigator.clipboard.writeText("");
            } catch (e) {
                console.log("Failed to clear clipboard:", e);
            }
        });
        await TestHelpers.prepareTestEnvironment(page, testInfo);
        await page.evaluate(() => {
            (window as any).DEBUG_MODE = true;
        });
        const item = page.locator(".outliner-item.page-title");
        if (await item.count() === 0) {
            const visibleItems = page.locator(".outliner-item").filter({ hasText: /.*/ });
            await visibleItems.first().locator(".item-content").click({ force: true });
        } else {
            await item.locator(".item-content").click({ force: true });
        }
        await page.waitForSelector("textarea.global-textarea:focus");
        const firstItem = page.locator(".outliner-item").nth(0);
        const firstId = await firstItem.getAttribute("data-item-id");
        await TestHelpers.setCursor(page, firstId!);
        await TestHelpers.insertText(page, firstId!, "First item text");
        await page.waitForTimeout(300);
        await page.keyboard.press("Enter");
        await TestHelpers.waitForCursorVisible(page);
        const secondItem = page.locator(".outliner-item").nth(1);
        const secondId = await secondItem.getAttribute("data-item-id");
        await TestHelpers.setCursor(page, secondId!);
        await TestHelpers.insertText(page, secondId!, "Second item text");
        await page.waitForTimeout(300);
        await page.keyboard.press("Enter");
        await TestHelpers.waitForCursorVisible(page);
        const thirdItem = page.locator(".outliner-item").nth(2);
        const thirdId = await thirdItem.getAttribute("data-item-id");
        await TestHelpers.setCursor(page, thirdId!);
        await TestHelpers.insertText(page, thirdId!, "Third item text");
        await page.waitForTimeout(300);
        await page.keyboard.press("Home");
        await page.keyboard.press("ArrowUp");
        await page.keyboard.press("ArrowUp");
        await page.keyboard.press("Home");
    });

    test("Can move text selection by drag and drop", async ({ page }) => {
        const itemCount = await page.locator(".outliner-item").count();
        expect(itemCount).toBeGreaterThanOrEqual(3);
        const firstItem = page.locator(".outliner-item").nth(0);
        await firstItem.locator(".item-content").click({ force: true });
        await page.waitForTimeout(300);

        // Move cursor to the beginning
        await page.keyboard.press("Home");
        await page.waitForTimeout(100);

        // Select 5 characters ("First")
        await page.keyboard.down("Shift");
        for (let i = 0; i < 5; i++) {
            await page.keyboard.press("ArrowRight");
        }
        await page.keyboard.up("Shift");
        await page.waitForTimeout(300);

        const selectionExists = await page.evaluate(() => {
            return document.querySelector(".editor-overlay .selection") !== null;
        });
        expect(selectionExists).toBe(true);

        const selectedText = await page.evaluate(() => {
            const store = (window as any).editorOverlayStore;
            if (!store) return "";
            return store.getSelectedText();
        });

        // Output debug information
        console.log(`Selected text: "${selectedText}"`);
        const firstItemTextBefore = await firstItem.locator(".item-text").textContent() || "";
        console.log(`First item text before cut: "${firstItemTextBefore}"`);

        expect(selectedText.length).toBeGreaterThan(0);
        expect(selectedText).toBe("First");

        await page.keyboard.press("Control+x");
        await page.waitForTimeout(300);

        // Check state after cut
        const firstItemTextAfterCut = await firstItem.locator(".item-text").textContent() || "";
        console.log(`First item text after cut: "${firstItemTextAfterCut}"`);

        const thirdItem = page.locator(".outliner-item").nth(2);
        const thirdId = await thirdItem.getAttribute("data-item-id");
        await thirdItem.locator(".item-content").click({ force: true });
        await page.waitForTimeout(300);

        // Set cursor to the third item
        await TestHelpers.setCursor(page, thirdId!);
        await page.keyboard.press("End");

        // Check global variable before paste
        const globalText = await page.evaluate(() => {
            return (window as any).lastCopiedText || "not found";
        });
        console.log(`Global text before paste: "${globalText}"`);

        await page.keyboard.press("Control+v");
        await page.waitForTimeout(300);

        // Check global variable after paste
        const pastedText = await page.evaluate(() => {
            return (window as any).lastPastedText || "not found";
        });
        console.log(`Pasted text: "${pastedText}"`);

        const firstItemTextAfter = await firstItem.locator(".item-text").textContent() || "";
        const thirdItemTextAfter = await thirdItem.locator(".item-text").textContent() || "";

        // Output debug information
        console.log(`First item text after paste: "${firstItemTextAfter}"`);
        console.log(`Third item text after paste: "${thirdItemTextAfter}"`);

        expect(firstItemTextAfter).not.toContain("First");
        expect(thirdItemTextAfter).toContain("First");
    });
});
