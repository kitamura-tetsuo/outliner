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

        // The cursor might be placed at the point of click, or it might be at the end of the line
        // To be sure we are selecting from the beginning, press Home first
        await page.keyboard.press("Home");
        await page.waitForTimeout(100);

        // Select part of the long text
        await page.keyboard.down("Shift");
        for (let i = 0; i < 50; i++) {
            await page.keyboard.press("ArrowRight");
        }
        await page.keyboard.up("Shift");

        // Confirm that the selection range is created
        const selection = page.locator(".editor-overlay .selection").first();
        await expect(selection).toBeVisible({ timeout: 1000 });

        // Reliable copy via page.evaluate
        const textToCopy = await page.evaluate(() => {
            const editorOverlayStore = (window as any).editorOverlayStore;
            if (editorOverlayStore) {
                const selections = Object.values(editorOverlayStore.selections);
                if (selections.length > 0) {
                    return editorOverlayStore.getTextFromSelection(selections[0]);
                }
            }
            return null;
        });

        expect(textToCopy).toBeTruthy();
        expect(textToCopy).toContain("This is a very long text");

        // Move to the second item explicitly via locator to avoid keyboard navigation flakiness
        // with wrapped long text lines
        const secondItem = page.locator(".outliner-item").nth(2);
        await secondItem.locator(".item-content").click({ force: true });
        await TestHelpers.waitForCursorVisible(page);

        await page.keyboard.press("End");

        // Wait for cursor position update
        await page.waitForTimeout(100);

        await page.evaluate((textToPaste) => {
            const editorOverlayStore = (window as any).editorOverlayStore;
            if (editorOverlayStore && textToPaste) {
                const cursorInstances = editorOverlayStore.getCursorInstances();
                cursorInstances.forEach((cursor: any) => cursor.insertText(textToPaste));
                editorOverlayStore.triggerOnEdit?.();
            }
        }, textToCopy);

        // Wait for store changes to reflect
        await page.waitForTimeout(500);

        // Check the pasted text
        const secondItemText = await page.locator(".outliner-item").nth(2).locator(".item-text").textContent();
        expect(secondItemText).toContain("Second item text");
        expect(secondItemText).toContain("This is a very long text");
    });
});
