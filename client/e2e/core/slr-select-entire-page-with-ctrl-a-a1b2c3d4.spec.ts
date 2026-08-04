import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

test.describe("Select entire page with Ctrl/Cmd+A", () => {
    test("Select the full page from a middle body item", async ({ page }, testInfo) => {
        await TestHelpers.seedProjectAndNavigate(page, testInfo, [
            "Title",
            "Item 1",
            "  Nested child",
            "Item 3",
        ]);

        const middleItem = page.locator(".editor-item-content").nth(1);
        await middleItem.click();

        await page.keyboard.press("Control+a");
        await page.waitForTimeout(300);

        const text = await page.evaluate(() => (window as any).editorOverlayStore.getSelectedText());
        expect(text).toBe("Title\nItem 1\nNested child\nItem 3");

        const selectionCount = await page.evaluate(() =>
            Object.keys((window as any).editorOverlayStore.selections).length
        );
        expect(selectionCount).toBe(1);

        const storeSelections = await page.evaluate(() => (window as any).editorOverlayStore.selections);
        const selectionsKeys = Object.keys(storeSelections);
        const selection = storeSelections[selectionsKeys[0]];
        const items = await page.locator(".editor-item").all();
        const titleId = await items[0].getAttribute("data-item-id");
        const lastItemId = await items[3].getAttribute("data-item-id");

        expect(selection.startItemId).toBe(titleId);
        expect(selection.startOffset).toBe(0);
        expect(selection.endItemId).toBe(lastItemId);
        expect(selection.endOffset).toBe(6); // "Item 3".length
    });

    test("Repeated Ctrl+A is idempotent", async ({ page }, testInfo) => {
        await TestHelpers.seedProjectAndNavigate(page, testInfo, [
            "Title",
            "Item 1",
            "  Nested child",
            "Item 3",
        ]);

        const middleItem = page.locator(".editor-item-content").nth(1);
        await middleItem.click();

        await page.keyboard.press("Control+a");
        await page.waitForTimeout(100);
        await page.keyboard.press("Control+a");
        await page.waitForTimeout(100);
        await page.keyboard.press("Control+a");
        await page.waitForTimeout(300);

        const text = await page.evaluate(() => (window as any).editorOverlayStore.getSelectedText());
        expect(text).toBe("Title\nItem 1\nNested child\nItem 3");

        const selectionCount = await page.evaluate(() =>
            Object.keys((window as any).editorOverlayStore.selections).length
        );
        expect(selectionCount).toBe(1);
    });

    test("Existing local selection is replaced", async ({ page }, testInfo) => {
        await TestHelpers.seedProjectAndNavigate(page, testInfo, [
            "Title",
            "Item 1",
        ]);

        const titleItem = page.locator(".editor-item-content").first();
        await titleItem.click();
        await page.keyboard.press("Shift+ArrowDown");
        await page.waitForTimeout(100);

        let selectionCount = await page.evaluate(() =>
            Object.keys((window as any).editorOverlayStore.selections).length
        );
        expect(selectionCount).toBe(1);

        await page.keyboard.press("Control+a");
        await page.waitForTimeout(300);

        const text = await page.evaluate(() => (window as any).editorOverlayStore.getSelectedText());
        expect(text).toBe("Title\nItem 1");

        selectionCount = await page.evaluate(() => Object.keys((window as any).editorOverlayStore.selections).length);
        expect(selectionCount).toBe(1);
    });

    test("Title-only page works without errors", async ({ page }, testInfo) => {
        await TestHelpers.seedProjectAndNavigate(page, testInfo, [
            "Only Title",
        ]);

        const titleItem = page.locator(".editor-item-content").first();
        await titleItem.click();

        await page.keyboard.press("Control+a");
        await page.waitForTimeout(300);

        const text = await page.evaluate(() => (window as any).editorOverlayStore.getSelectedText());
        expect(text).toBe("Only Title");

        const selectionCount = await page.evaluate(() =>
            Object.keys((window as any).editorOverlayStore.selections).length
        );
        expect(selectionCount).toBe(1);
    });

    test("Platform and focus ownership (Meta+a and foreign input)", async ({ page }, testInfo) => {
        await TestHelpers.seedProjectAndNavigate(page, testInfo, [
            "Title",
            "Item 1",
        ]);

        const middleItem = page.locator(".editor-item-content").nth(1);
        await middleItem.click();

        await page.keyboard.press("Meta+a");
        await page.waitForTimeout(300);

        const text = await page.evaluate(() => (window as any).editorOverlayStore.getSelectedText());
        expect(text).toBe("Title\nItem 1");

        // Focus search input
        const searchInput = page.getByPlaceholder("Search...");
        await searchInput.click();
        await searchInput.fill("hello");
        await page.keyboard.press("Control+a");
        await page.waitForTimeout(100);

        const isInputSelected = await page.evaluate(() => {
            const el = document.activeElement as HTMLInputElement;
            return el && el.selectionStart === 0 && el.selectionEnd === el.value.length;
        });
        expect(isInputSelected).toBe(true);
    });
});
