import { expect, test } from "@playwright/test";
import { devices } from "@playwright/test";
import { waitForCursorVisible } from "../../e2e/helpers";
import { CursorValidator } from "../../e2e/utils/cursorValidation";
import { TestHelpers } from "../../e2e/utils/testHelpers";

test.use({ ...devices["Pixel 7"] });

test("Mobile OS selection changes sync back to outliner store", async ({ page }, testInfo) => {
    // 1. Setup seeded project
    const lines = [
        "First item",
        "Second item",
        "Third item",
    ];
    await TestHelpers.seedProjectAndNavigate(page, testInfo, lines);

    // 2. Wait for items to be rendered and focus the first item
    const firstItem = page.locator(".outliner-item", { hasText: "First item" }).first();
    await expect(firstItem).toBeVisible();
    await firstItem.locator(".item-text").click();

    // Verify initial state
    await waitForCursorVisible(page);
    let cursorData = await CursorValidator.getCursorData(page);
    expect(cursorData.cursors.length).toBe(1);

    // Wait for the hidden textarea to be properly mounted and focused
    const textarea = page.locator(".global-textarea");
    await expect(textarea).toBeFocused();
    // Simulate user interaction before querying textarea value to trigger syncTextareaToActiveItem
    await page.keyboard.press("ArrowRight");

    await page.waitForFunction(() => {
        const ta = document.querySelector(".global-textarea") as HTMLTextAreaElement;
        return ta && ta.value === "First item";
    });

    // 3. Simulate OS "Select All" / drag selection via setting textarea selection range
    // Since we cannot trigger OS context menus in Playwright easily on mobile,
    // we manipulate the hidden textarea directly and dispatch a 'selectionchange' event.
    await page.evaluate(() => {
        const ta = document.querySelector(".global-textarea") as HTMLTextAreaElement;
        if (ta) {
            ta.setSelectionRange(0, 5); // Select "First"
            document.dispatchEvent(new Event("selectionchange"));
        }
    });

    // 4. Verify that the Outliner store synchronized the selection correctly
    // The selection should now be set in the editor overlay store.
    await page.waitForFunction(() => {
        const win = window as any;
        return Object.keys(win.editorOverlayStore.selections).length > 0;
    });

    cursorData = await CursorValidator.getCursorData(page);
    const selectionKey = Object.keys(cursorData.selections)[0];
    const selection = cursorData.selections[selectionKey];
    expect(selection.startOffset).toBe(0);
    expect(selection.endOffset).toBe(5);

    // 5. Simulate typing to replace the selected text
    await page.keyboard.type("New");

    // Verify that the text was actually replaced ("New item")
    const newlyActiveItem = page.locator(".outliner-item", { hasText: "New item" }).first();
    await expect(newlyActiveItem.locator(".item-text")).toHaveText("New item");

    // 6. Test cursor move simulation (Gboard swipe on spacebar)
    await page.evaluate(() => {
        const ta = document.querySelector(".global-textarea") as HTMLTextAreaElement;
        if (ta) {
            // Move cursor after "New "
            ta.setSelectionRange(4, 4);
            document.dispatchEvent(new Event("selectionchange"));
        }
    });

    // Wait for cursor position update
    await page.waitForFunction(() => {
        const win = window as any;
        const cursors = Object.values(win.editorOverlayStore.cursors);
        return cursors.length > 0 && (cursors[0] as any).offset === 4;
    });

    await page.keyboard.type("word ");
    // Use locator strictly for this test
    const finalItem = page.locator(".outliner-item", { hasText: "New word item" }).first();
    await expect(finalItem.locator(".item-text")).toHaveText("New word item");
});
