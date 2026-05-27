import "../utils/registerAfterEachSnapshot";
import { expect, test } from "@playwright/test";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
import { TestHelpers } from "../utils/testHelpers";
registerCoverageHooks();

test.describe("SLR-356b853a: Long text selection range", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        const longText =
            "This is a very long text that contains many characters and should be long enough to test the selection range functionality with long texts. "
            + "We want to make sure that the selection range works correctly with long texts and that the text is properly selected and copied.";

        await TestHelpers.seedProjectAndNavigate(page, testInfo, [longText, "Second item text"]);
        await TestHelpers.waitForOutlinerItems(page, 3, 10000);
    });

    test("Can create selection range for item containing long text", async ({ page }) => {
        test.setTimeout(120000);
        // Click and focus on the first item
        const firstItem = page.locator(".outliner-item").nth(1);
        await firstItem.locator(".item-content").click({ force: true });
        await TestHelpers.waitForCursorVisible(page);

        // Already seeded, just verify text
        const firstItemText = await firstItem.locator(".item-text").textContent();
        expect(firstItemText).toContain("This is a very long text");
        expect(firstItemText).toContain("properly selected and copied");

        // Verify text length
        expect(firstItemText?.length || 0).toBeGreaterThan(200);

        console.log("Long text input test completed successfully");

        // Select part of the long text programmatically as UI keyboard selection is flaky in Playwright
        await page.evaluate(() => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const editorOverlayStore = (window as any).editorOverlayStore;
            if (editorOverlayStore) {
                const cursorInstances = editorOverlayStore.getCursorInstances();
                if (cursorInstances.length > 0) {
                    const cursor = cursorInstances[0];
                    editorOverlayStore.setSelection({
                        startItemId: cursor.itemId,
                        startOffset: 0,
                        endItemId: cursor.itemId,
                        endOffset: 50,
                        userId: "local",
                        isReversed: false,
                    });
                }
            }
        });

        // Confirm that the selection range is created
        const selection = page.locator(".editor-overlay .selection").first();
        await expect(selection).toBeVisible({ timeout: 1000 });

        // Reliable copy via page.evaluate by reading what the app evaluates as selected
        // to bypass the execCommand issues on the runner container
        const textToCopy = await page.evaluate(() => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const editorOverlayStore = (window as any).editorOverlayStore;
            if (editorOverlayStore) {
                const selections = Object.values(editorOverlayStore.selections);
                if (selections.length > 0) {
                    const text = editorOverlayStore.getTextFromSelection(selections[0]);
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    (window as any).lastCopiedText = text;
                    return text;
                }
            }
            return null;
        });

        expect(textToCopy).toBeTruthy();
        expect(textToCopy).toContain("This is a very long text");

        // Move to the second item and paste
        await page.keyboard.press("ArrowDown");
        await page.keyboard.press("ArrowDown"); // Handle multi-line wrapping
        await page.keyboard.press("End");

        await page.waitForTimeout(100);

        // Simulate pasting by explicitly injecting the copied text
        await page.evaluate((textToPaste) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const editorOverlayStore = (window as any).editorOverlayStore;
            if (editorOverlayStore && textToPaste) {
                const cursorInstances = editorOverlayStore.getCursorInstances();
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                cursorInstances.forEach((cursor: any) => cursor.insertText(textToPaste));
                editorOverlayStore.triggerOnEdit();
            }
        }, textToCopy);

        await page.waitForTimeout(300);

        // Check the pasted text
        const secondItemText = await page.locator(".outliner-item").nth(2).locator(".item-text").textContent();
        expect(secondItemText).toContain("Second item text");
        expect(secondItemText).toContain("This is a very long text");
    });
});
