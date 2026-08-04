import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
/** @feature SLR-a1b2c3d4
 *  Title   : Select entire page with Ctrl/Cmd+A
 *  Source  : docs/client-features.yaml
 */
import { expect, test } from "@playwright/test";
import { CursorValidator } from "../utils/cursorValidation";
import { TestHelpers } from "../utils/testHelpers";

test.describe("Select entire page with Ctrl/Cmd+A", () => {
    test("Select the full page from a middle body item", async ({ page }, testInfo) => {
        const { pageName } = await TestHelpers.seedProjectAndNavigate(page, testInfo, [
            "Item 1",
            "  Nested child",
            "Item 3",
        ]);

        await page.waitForSelector("[data-item-id]");
        const items = page.locator("[data-item-id]");
        await expect(items.nth(3)).toBeVisible();

        const allItems = await items.all();
        const firstBodyId = await allItems[1].getAttribute("data-item-id");

        // Focus using data-item-id
        await page.locator(`[data-item-id="${firstBodyId}"]`).click();

        // Wait for global textarea and cursor to be active
        await page.waitForFunction(() => {
            const textarea = document.querySelector(".global-textarea") as HTMLTextAreaElement;
            return textarea && document.activeElement === textarea;
        });

        await page.keyboard.press("Control+a");
        await page.waitForTimeout(300);

        const text = await page.evaluate(() => (globalThis as any).editorOverlayStore.getSelectedText());
        expect(text).toBe(`${pageName}\nItem 1\n  Nested child\nItem 3`);

        const cursorData = await CursorValidator.getCursorData(page);
        expect(cursorData.selectionCount).toBe(1);

        const storeSelections = await page.evaluate(() => (globalThis as any).editorOverlayStore.selections);
        const selectionsKeys = Object.keys(storeSelections);
        const selection = storeSelections[selectionsKeys[0]];
        const titleId = await allItems[0].getAttribute("data-item-id");
        const lastItemId = await allItems[3].getAttribute("data-item-id");

        expect(selection.startItemId).toBe(titleId);
        expect(selection.startOffset).toBe(0);
        expect(selection.endItemId).toBe(lastItemId);
        expect(selection.endOffset).toBe(6); // "Item 3".length

        const overlayElements = await page.locator(".editor-overlay .selection").all();
        expect(overlayElements.length).toBeGreaterThan(0);
    });

    test("Repeated Ctrl+A is idempotent", async ({ page }, testInfo) => {
        const { pageName } = await TestHelpers.seedProjectAndNavigate(page, testInfo, [
            "Item 1",
            "  Nested child",
            "Item 3",
        ]);

        await page.waitForSelector("[data-item-id]");
        const items = page.locator("[data-item-id]");
        await expect(items.nth(3)).toBeVisible();

        const allItems = await items.all();
        const firstBodyId = await allItems[1].getAttribute("data-item-id");

        await page.locator(`[data-item-id="${firstBodyId}"]`).click();

        await page.waitForFunction(() => {
            const textarea = document.querySelector(".global-textarea") as HTMLTextAreaElement;
            return textarea && document.activeElement === textarea;
        });

        await page.keyboard.press("Control+a");
        await page.waitForTimeout(100);
        await page.keyboard.press("Control+a");
        await page.waitForTimeout(100);
        await page.keyboard.press("Control+a");
        await page.waitForTimeout(300);

        const text = await page.evaluate(() => (globalThis as any).editorOverlayStore.getSelectedText());
        expect(text).toBe(`${pageName}\nItem 1\n  Nested child\nItem 3`);

        const cursorData = await CursorValidator.getCursorData(page);
        expect(cursorData.selectionCount).toBe(1);
    });

    test("Existing local selection is replaced", async ({ page }, testInfo) => {
        const { pageName } = await TestHelpers.seedProjectAndNavigate(page, testInfo, [
            "Item 1",
        ]);

        await page.waitForSelector("[data-item-id]");
        const items = page.locator("[data-item-id]");
        await expect(items.nth(1)).toBeVisible();

        const allItems = await items.all();
        const titleId = await allItems[0].getAttribute("data-item-id");

        await page.locator(`[data-item-id="${titleId}"]`).click();

        await page.waitForFunction(() => {
            const textarea = document.querySelector(".global-textarea") as HTMLTextAreaElement;
            return textarea && document.activeElement === textarea;
        });

        await page.keyboard.press("Shift+ArrowDown");
        await page.waitForTimeout(100);

        let cursorData = await CursorValidator.getCursorData(page);
        expect(cursorData.selectionCount).toBe(1);

        await page.keyboard.press("Control+a");
        await page.waitForTimeout(300);

        const text = await page.evaluate(() => (globalThis as any).editorOverlayStore.getSelectedText());
        expect(text).toBe(`${pageName}\nItem 1`);

        cursorData = await CursorValidator.getCursorData(page);
        expect(cursorData.selectionCount).toBe(1);
    });

    test("Title-only page works without errors", async ({ page }, testInfo) => {
        const { pageName } = await TestHelpers.seedProjectAndNavigate(page, testInfo, []);

        await page.waitForSelector("[data-item-id]");
        const items = page.locator("[data-item-id]");
        await expect(items.nth(0)).toBeVisible();

        const allItems = await items.all();
        const titleId = await allItems[0].getAttribute("data-item-id");

        await page.locator(`[data-item-id="${titleId}"]`).click();

        await page.waitForFunction(() => {
            const textarea = document.querySelector(".global-textarea") as HTMLTextAreaElement;
            return textarea && document.activeElement === textarea;
        });

        await page.keyboard.press("Control+a");
        await page.waitForTimeout(300);

        const text = await page.evaluate(() => (globalThis as any).editorOverlayStore.getSelectedText());
        expect(text).toBe(pageName);

        const cursorData = await CursorValidator.getCursorData(page);
        expect(cursorData.selectionCount).toBe(1);
    });

    test("Platform and focus ownership (Meta+a and foreign input)", async ({ page }, testInfo) => {
        const { pageName } = await TestHelpers.seedProjectAndNavigate(page, testInfo, [
            "Item 1",
        ]);

        await page.waitForSelector("[data-item-id]");
        const items = page.locator("[data-item-id]");
        await expect(items.nth(1)).toBeVisible();

        const allItems = await items.all();
        const firstBodyId = await allItems[1].getAttribute("data-item-id");

        await page.locator(`[data-item-id="${firstBodyId}"]`).click();

        await page.waitForFunction(() => {
            const textarea = document.querySelector(".global-textarea") as HTMLTextAreaElement;
            return textarea && document.activeElement === textarea;
        });

        await page.keyboard.press("Meta+a");
        await page.waitForTimeout(300);

        const text = await page.evaluate(() => (globalThis as any).editorOverlayStore.getSelectedText());
        expect(text).toBe(`${pageName}\nItem 1`);

        // Focus search input
        const searchInput = page.getByRole("combobox", { name: "Search pages" });
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
