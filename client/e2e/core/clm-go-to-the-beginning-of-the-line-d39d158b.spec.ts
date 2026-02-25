import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
/** @feature CLM-0007
 *  Title   : Move to the beginning of the line
 *  Source  : docs/client-features.yaml
 */
import { expect, test } from "@playwright/test";
import { CursorValidator } from "../utils/cursorValidation";
import { TestHelpers } from "../utils/testHelpers";

// Increase timeout as this test takes time

test.describe("CLM-0007: Move to the beginning of the line", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        await TestHelpers.prepareTestEnvironment(page, testInfo, ["First line", "Second line", "Third line"]);
        await TestHelpers.waitForOutlinerItems(page, 3, 30000);
        // Ensure all seeded items are visible
        await page.locator(".outliner-item[data-item-id] >> nth=2").waitFor();

        // Get and click the second item (Second line)
        const secondItemId = await TestHelpers.getItemIdByIndex(page, 1);
        expect(secondItemId).not.toBeNull();
        const item = page.locator(`.outliner-item[data-item-id="${secondItemId}"] .item-content`);
        await item.click({ force: true });

        // Wait for global textarea to be focused
        await page.waitForSelector("textarea.global-textarea:focus");

        // Wait for cursor to be visible
        await TestHelpers.waitForCursorVisible(page);

        // Move cursor slightly to the right (to verify Home key effect)
        await page.keyboard.press("ArrowRight");
        await page.keyboard.press("ArrowRight");
        await page.keyboard.press("ArrowRight");
    });

    test("Pressing Home key moves cursor to the beginning of the current line", async ({ page }) => {
        // Wait for cursor to be visible
        await TestHelpers.waitForCursorVisible(page);

        // Get active item ID
        const activeItemId = await TestHelpers.getActiveItemId(page);
        expect(activeItemId).not.toBeNull();

        // Get active item
        const activeItem = page.locator(`.outliner-item[data-item-id="${activeItemId}"]`);
        await activeItem.waitFor({ state: "visible" });

        // Wait for cursor instance to exist
        await page.waitForFunction(() => {
            const editorOverlayStore = (window as any).editorOverlayStore;
            if (!editorOverlayStore) return false;
            const cursorInstances = editorOverlayStore.getCursorInstances();
            return cursorInstances && cursorInstances.length > 0;
        }, { timeout: 10000 });

        // Wait a bit for DOM update
        await page.waitForTimeout(100);

        // Wait for editor overlay to be visible
        await expect(page.locator(".editor-overlay")).toBeVisible({ timeout: 10000 });

        // Wait for cursor element to be visible
        const cursorLocator = page.locator(".editor-overlay .cursor");
        await expect(cursorLocator.first()).toBeVisible({ timeout: 10000 });

        // Use the first cursor if there are multiple
        const cursor = cursorLocator.first();

        // Wait for cursor info retrieval and check initial state
        await page.waitForTimeout(300);
        const initialCursorData = await CursorValidator.getCursorData(page);
        console.log(`Initial cursor data:`, initialCursorData);
        expect(initialCursorData.cursorCount).toBeGreaterThan(0);

        // Get initial cursor position
        const initialX = await cursor.evaluate(el => el.getBoundingClientRect().left);
        console.log(`Initial cursor X position: ${initialX}`);

        // Verify textarea has focus
        await page.waitForSelector("textarea.global-textarea:focus", { timeout: 5000 });

        // Press Home key
        await page.keyboard.press("Home");
        // Wait for update (cursor movement might be delayed)
        await page.waitForTimeout(800); // Wait a bit more for DOM update

        // Get and verify new cursor offset
        const newCursorData = await CursorValidator.getCursorData(page);
        console.log(`New cursor data:`, newCursorData);

        // Wait for editor overlay DOM update
        await expect(cursor).toBeVisible({ timeout: 10000 });

        // Get new cursor position
        const newX = await cursor.evaluate(el => el.getBoundingClientRect().left);
        console.log(`New cursor X position: ${newX}`);

        // Verify cursor moved left (check internal offset, not DOM position)
        // Verify offset is reset to 0 by Home key
        expect(newCursorData.cursors[0].offset).toBeLessThan(initialCursorData.cursors[0].offset);
        expect(newCursorData.cursors[0].offset).toBe(0); // Home key moves to beginning of line (offset 0)

        // Verify cursor position is at the beginning of the line (as internal state)
        // Re-verify offset is 0 after pressing Home key
        const finalCursorData = await CursorValidator.getCursorData(page);
        expect(finalCursorData.cursors[0].offset).toBe(0);
        expect(finalCursorData.activeItemId).not.toBeNull();
    });

    test("In a multi-item list, cursor moves to the beginning of the current line", async ({ page }) => {
        // Wait for cursor to be visible
        await TestHelpers.waitForCursorVisible(page);

        // Get active item ID
        const activeItemId = await TestHelpers.getActiveItemId(page);
        expect(activeItemId).not.toBeNull();

        // Get active item
        const activeItem = page.locator(`.outliner-item[data-item-id="${activeItemId}"]`);
        await activeItem.waitFor({ state: "visible" });

        // Move cursor to the 3rd line
        await page.keyboard.press("ArrowDown");

        // Wait for cursor instance to exist
        await page.waitForFunction(() => {
            const editorOverlayStore = (window as any).editorOverlayStore;
            if (!editorOverlayStore) return false;
            const cursorInstances = editorOverlayStore.getCursorInstances();
            return cursorInstances && cursorInstances.length > 0;
        }, { timeout: 10000 });

        // Wait a bit for DOM update
        await page.waitForTimeout(100);

        // Wait for editor overlay to be visible
        await expect(page.locator(".editor-overlay")).toBeVisible({ timeout: 10000 });

        // Wait for cursor element to be visible
        const cursorLocator = page.locator(".editor-overlay .cursor");
        await expect(cursorLocator.first()).toBeVisible({ timeout: 10000 });

        // Use the first cursor if there are multiple
        const cursor = cursorLocator.first();

        // Wait for cursor info retrieval and check initial state
        await page.waitForTimeout(300);
        const initialCursorData = await CursorValidator.getCursorData(page);
        console.log(`Initial cursor data in second test:`, initialCursorData);
        expect(initialCursorData.cursorCount).toBeGreaterThan(0);

        // Get initial cursor position
        const initialX = await cursor.evaluate(el => el.getBoundingClientRect().left);
        console.log(`Initial cursor X position in second test: ${initialX}`);

        // Verify textarea has focus
        await page.waitForSelector("textarea.global-textarea:focus", { timeout: 5000 });

        // Press Home key
        await page.keyboard.press("Home");
        // Wait for update (cursor movement might be delayed)
        await page.waitForTimeout(800); // Wait a bit more for DOM update

        // Get and verify new cursor offset
        const newCursorData = await CursorValidator.getCursorData(page);
        console.log(`New cursor data in second test:`, newCursorData);

        // Wait for editor overlay DOM update
        await expect(cursor).toBeVisible({ timeout: 10000 });

        // Get new cursor position
        const newX = await cursor.evaluate(el => el.getBoundingClientRect().left);
        console.log(`New cursor X position in second test: ${newX}`);

        // Verify cursor moved left (check internal offset, not DOM position)
        // Verify offset is reset to 0 by Home key
        expect(newCursorData.cursors[0].offset).toBeLessThan(initialCursorData.cursors[0].offset);
        expect(newCursorData.cursors[0].offset).toBe(0); // Home key moves to beginning of line (offset 0)

        // Verify cursor position is at the beginning of the line (as internal state)
        // Re-verify offset is 0 after pressing Home key
        const finalCursorData = await CursorValidator.getCursorData(page);
        expect(finalCursorData.cursors[0].offset).toBe(0);
        expect(finalCursorData.activeItemId).not.toBeNull();
    });
});
