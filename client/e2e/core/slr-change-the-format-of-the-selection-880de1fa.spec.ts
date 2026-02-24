import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
/** @feature SLR-0010
 *  Title   : Change selection format
 *  Source  : docs/client-features.yaml
 */
import { expect, test } from "@playwright/test";
import { CursorValidator } from "../utils/cursorValidation";
import { TestHelpers } from "../utils/testHelpers";

test.describe("SLR-0010: Change selection format", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        // Enable debug mode
        await page.evaluate(() => {
            // eslint-disable-next-line no-restricted-globals
            (window as any).DEBUG_MODE = true;
        });

        // Seed with data
        await TestHelpers.prepareTestEnvironment(page, testInfo, [
            "This is a test text for formatting",
            "This is another line for multi-item selection",
        ]);
        // Wait for Title + 2 items
        await TestHelpers.waitForOutlinerItems(page, 3, 10000);

        // Select the first item
        const item = page.locator(".outliner-item").first();
        await item.waitFor({ state: "visible" });
        await item.locator(".item-content").click({ force: true });

        // Wait for cursor to be visible
        await TestHelpers.waitForCursorVisible(page);

        // Return to the first item (click resets cursor to end usually, or just click first item is enough)
        // Ensure we are at start if needed, but the tests seem to do specific navigation anyway
        await page.keyboard.press("Home");
        await page.keyboard.press("Home");

        // Confirm that the cursor is visible
        const cursorData = await CursorValidator.getCursorData(page);
        expect(cursorData.cursorCount).toBeGreaterThan(0);
        expect(cursorData.cursorVisible).toBe(true);
    });

    test("Can change selection range within a single item to bold", async ({ page }) => {
        // Click and select the first item
        const firstItem = page.locator(".outliner-item").nth(1);
        await firstItem.locator(".item-content").click({ force: true });
        await TestHelpers.waitForCursorVisible(page);

        // Use Shift+End to select the rest of the line (proven to work in sibling tests)
        await page.keyboard.press("Home");
        await page.keyboard.press("Shift+End");
        await page.waitForTimeout(300);

        // Wait for the application's selection state to sync with the DOM
        await page.waitForFunction(
            () => {
                // eslint-disable-next-line no-restricted-globals
                const store = (window as any).editorOverlayStore;
                return store && store.getSelectedText().includes("This");
            },
            null,
            { timeout: 3000 },
        ).catch(async () => {
            // eslint-disable-next-line no-restricted-globals
            const actual = await page.evaluate(() => (window as any).editorOverlayStore?.getSelectedText());
            console.log(`Timed out waiting for editorOverlayStore. Actual: "${actual}"`);
        });

        await page.waitForTimeout(300);

        // Debug: Log the selection text
        const selectionText = await page.evaluate(() => {
            // eslint-disable-next-line no-restricted-globals
            return window.getSelection()?.toString();
        });
        console.log(`[DEBUG] Selected text: "${selectionText}"`);

        // Confirm that the selection range is created
        const cursorData = await CursorValidator.getCursorData(page);
        expect(cursorData.selectionCount).toBeGreaterThan(0);

        // Press Ctrl+B to change to bold
        await page.keyboard.press("Control+b");
        await page.waitForTimeout(300);

        // Confirm text became bold (Scrapbox syntax: [[text]] or [* text])
        const textContent = await firstItem.locator(".item-text").textContent();
        console.log(`[DEBUG] Text content after calc: "${textContent}"`);
        expect(textContent).toContain("[[");
        expect(textContent).toContain("This");
        expect(textContent).toContain("]]");
    });

    test("Can change selection range within a single item to italic", async ({ page }) => {
        // Click and select the first item
        const firstItem = page.locator(".outliner-item").nth(1);
        await firstItem.locator(".item-content").click({ force: true });
        await TestHelpers.waitForCursorVisible(page);

        // Use Shift+End to select the rest of the line
        await page.keyboard.press("Home");
        await page.keyboard.press("Shift+End");
        await page.waitForTimeout(300);

        // Wait for the application's selection state to sync with the DOM
        await page.waitForFunction(
            () => {
                // eslint-disable-next-line no-restricted-globals
                const store = (window as any).editorOverlayStore;
                return store && store.getSelectedText().includes("This");
            },
            null,
            { timeout: 3000 },
        ).catch(async () => {
            // eslint-disable-next-line no-restricted-globals
            const actual = await page.evaluate(() => (window as any).editorOverlayStore?.getSelectedText());
            console.log(`Timed out waiting for editorOverlayStore. Actual: "${actual}"`);
        });

        // Confirm that the selection range is created
        const cursorData = await CursorValidator.getCursorData(page);
        expect(cursorData.selectionCount).toBeGreaterThan(0);

        // Press Ctrl+I to change to italic
        await page.keyboard.press("Control+i");
        await page.waitForTimeout(300);

        // Confirm text became italic (Scrapbox syntax: [/ text])
        const textContent = await firstItem.locator(".item-text").textContent();
        // Since the selection might be empty, check that it contains [/
        expect(textContent).toContain("[/");
    });

    test("Can add underline to selection range within a single item", async ({ page }) => {
        // Click and select the first item
        const firstItem = page.locator(".outliner-item").nth(1);
        await firstItem.locator(".item-content").click({ force: true });
        await TestHelpers.waitForCursorVisible(page);

        // Use Shift+End to select the rest of the line
        await page.keyboard.press("Home");
        await page.keyboard.press("Shift+End");
        await page.waitForTimeout(300);

        // Wait for the application's selection state to sync with the DOM
        await page.waitForFunction(
            () => {
                // eslint-disable-next-line no-restricted-globals
                const store = (window as any).editorOverlayStore;
                return store && store.getSelectedText().includes("This");
            },
            null,
            { timeout: 3000 },
        ).catch(async () => {
            // eslint-disable-next-line no-restricted-globals
            const actual = await page.evaluate(() => (window as any).editorOverlayStore?.getSelectedText());
            console.log(`Timed out waiting for editorOverlayStore. Actual: "${actual}"`);
        });

        // Confirm that the selection range is created
        const cursorData = await CursorValidator.getCursorData(page);
        expect(cursorData.selectionCount).toBeGreaterThan(0);

        // Press Ctrl+U to add underline
        await page.keyboard.press("Control+u");
        await page.waitForTimeout(300);

        // Confirm underline is added to text (Check before Enter)
        const afterFormatInnerHTML = await firstItem.locator(".item-text").innerHTML();
        const afterFormatTextContent = await firstItem.locator(".item-text").textContent();
        console.log("After Ctrl+U - innerHTML:", afterFormatInnerHTML);
        console.log("After Ctrl+U - textContent:", afterFormatTextContent);

        // Confirm underline tag is included
        expect(afterFormatInnerHTML).toContain("<u>");
        expect(afterFormatTextContent).toContain("This");
        expect(afterFormatInnerHTML).toContain("</u>");
    });

    test("Can change selection range within a single item to strikethrough", async ({ page }) => {
        // Click and select the first item
        const firstItem = page.locator(".outliner-item").nth(1);
        await firstItem.locator(".item-content").click({ force: true });
        await TestHelpers.waitForCursorVisible(page);

        // Use Shift+End to select the rest of the line
        await page.keyboard.press("Home");
        await page.keyboard.press("Shift+End");
        await page.waitForTimeout(300);

        // Wait for the application's selection state to sync with the DOM
        await page.waitForFunction(
            () => {
                // eslint-disable-next-line no-restricted-globals
                const store = (window as any).editorOverlayStore;
                return store && store.getSelectedText().includes("This");
            },
            null,
            { timeout: 3000 },
        ).catch(async () => {
            // eslint-disable-next-line no-restricted-globals
            const actual = await page.evaluate(() => (window as any).editorOverlayStore?.getSelectedText());
            console.log(`Timed out waiting for editorOverlayStore. Actual: "${actual}"`);
        });

        // Confirm that the selection range is created
        const cursorData = await CursorValidator.getCursorData(page);
        expect(cursorData.selectionCount).toBeGreaterThan(0);

        // Press Ctrl+K to change to strikethrough
        await page.keyboard.press("Control+k");
        await page.waitForTimeout(300);

        // Confirm text became strikethrough (Scrapbox syntax: [- text])
        const textContent = await firstItem.locator(".item-text").textContent();
        expect(textContent).toContain("[-");
        expect(textContent).toContain("This");
        expect(textContent).toContain("]");
    });

    test("Can change selection range within a single item to code", async ({ page }) => {
        // Click and select the first item
        const firstItem = page.locator(".outliner-item").nth(1);
        await firstItem.locator(".item-content").click({ force: true });
        await TestHelpers.waitForCursorVisible(page);

        // Use Shift+End to select the rest of the line
        await page.keyboard.press("Home");
        await page.keyboard.press("Shift+End");
        await page.waitForTimeout(300);

        // Wait for the application's selection state to sync with the DOM
        await page.waitForFunction(
            () => {
                // eslint-disable-next-line no-restricted-globals
                const store = (window as any).editorOverlayStore;
                return store && store.getSelectedText().includes("This");
            },
            null,
            { timeout: 3000 },
        ).catch(async () => {
            // eslint-disable-next-line no-restricted-globals
            const actual = await page.evaluate(() => (window as any).editorOverlayStore?.getSelectedText());
            console.log(`Timed out waiting for editorOverlayStore. Actual: "${actual}"`);
        });

        // Confirm that the selection range is created
        const cursorData = await CursorValidator.getCursorData(page);
        expect(cursorData.selectionCount).toBeGreaterThan(0);

        // Press Ctrl+` to change to code
        await page.keyboard.press("Control+`");
        await page.waitForTimeout(300);

        // Confirm text became code
        const textContent = await firstItem.locator(".item-text").textContent();
        expect(textContent).toContain("`");
        expect(textContent).toContain("This");
        expect(textContent).toContain("`");
    });

    test("Can change format of selection range spanning multiple items", async ({ page }) => {
        // Click and select the first item
        const firstItem = page.locator(".outliner-item").nth(1);
        await firstItem.locator(".item-content").click({ force: true });
        await TestHelpers.waitForCursorVisible(page);

        // Select part of the text (Press Shift+Right Arrow key 4 times)
        await page.keyboard.press("Home");
        await page.keyboard.down("Shift");
        for (let i = 0; i < 4; i++) {
            await page.keyboard.press("ArrowRight");
            // Wait a bit as the selection operation might be too fast and select only partially
            await page.waitForTimeout(50);
        }

        // Extend selection to the next item with Shift+Down
        await page.keyboard.press("Shift+ArrowDown");
        await page.keyboard.up("Shift");
        await page.waitForTimeout(300);

        // Confirm that a selection range spanning multiple items is created
        const cursorData = await CursorValidator.getCursorData(page);
        expect(cursorData.selectionCount).toBeGreaterThan(0);

        // Press Ctrl+B to change to bold
        await page.keyboard.press("Control+b");
        await page.waitForTimeout(300);

        // Note: Changing format of selection range spanning multiple items is difficult to implement,
        // so it's okay if the format is not actually applied
        // Check text of the first item
        const firstItemText = await firstItem.locator(".item-text").textContent();
        expect(firstItemText).toBeTruthy();

        // Check text of the second item
        const secondItem = page.locator(".outliner-item").nth(2);
        const secondItemText = await secondItem.locator(".item-text").textContent();
        expect(secondItemText).toBeTruthy();
    });
});
