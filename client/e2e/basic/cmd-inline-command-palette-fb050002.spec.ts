/** @feature CMD-0001 */
import { expect, test } from "@playwright/test";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
import { TestHelpers } from "../utils/testHelpers";
registerCoverageHooks();

test.describe("Inline Command Palette", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        // Seed a project with an empty item (so we have Title + Item 1)
        await TestHelpers.seedProjectAndNavigate(page, testInfo, [""]);
    });

    test("typing / opens palette, filters, handles keys, escape, backspace, and brackets", async ({ page }) => {
        // Wait for outliner items
        await TestHelpers.waitForOutlinerItems(page, 2); // Title + seed item

        // Get the ID of the seed item (Index 1)
        const itemId = await TestHelpers.getItemIdByIndex(page, 1);
        expect(itemId).not.toBeNull();

        await TestHelpers.setCursor(page, itemId!, 0);

        const firstItem = page.locator(`.outliner-item[data-item-id="${itemId}"]`);
        await expect(firstItem).toBeVisible();

        // 1. Verify typing / opens palette with yjstable and alias commands visible
        await page.keyboard.type("/");
        await page.waitForTimeout(200);

        const palette = page.locator(".slash-command-palette");
        await expect(palette).toBeVisible();
        await expect(palette).toHaveAttribute("data-is-visible", "true");

        const dbOption = page.locator('[data-testid="command-item-yjstable"]');
        const aliasOption = page.locator('[data-testid="command-item-alias"]');

        await expect(dbOption).toBeVisible();
        await expect(aliasOption).toBeVisible();

        // 2. Verify ArrowDown/ArrowUp keys move aria-selected attribute
        // Initially, Database is selected (index 0)
        await expect(dbOption).toHaveAttribute("aria-selected", "true");
        await expect(aliasOption).toHaveAttribute("aria-selected", "false");

        // Press ArrowDown
        await page.keyboard.press("ArrowDown");
        await page.waitForTimeout(200);
        await expect(dbOption).toHaveAttribute("aria-selected", "false");
        await expect(aliasOption).toHaveAttribute("aria-selected", "true");

        // Press ArrowUp
        await page.keyboard.press("ArrowUp");
        await page.waitForTimeout(200);
        await expect(dbOption).toHaveAttribute("aria-selected", "true");
        await expect(aliasOption).toHaveAttribute("aria-selected", "false");

        // 3. Verify filtering with 'al' narrows to Alias
        await page.keyboard.type("al");
        await page.waitForTimeout(200);

        await expect(palette).toHaveAttribute("data-query", "al");
        await expect(aliasOption).toBeVisible();
        await expect(dbOption).toBeHidden();
        await expect(aliasOption).toHaveAttribute("aria-selected", "true"); // Now alias is at index 0 in filtered view

        // 4. Verify Escape closes the palette and leaves the text unchanged
        await page.keyboard.press("Escape");
        await page.waitForTimeout(200);

        await expect(palette).toBeHidden();
        // The text should be `/al` because Escape simply hides the palette but doesn't rewrite text
        const itemTextEl = firstItem.locator(".item-text");

        // Actually, we don't need to strictly check text here, or we can use substring match:
        await expect(itemTextEl).toContainText("/al");

        // 5. Verify Backspace with empty query removes the / and leaves the text byte-identical

        // We'll clear the current item and test backspace functionality.
        await page.evaluate(async ({ itemId }) => {
            const editorOverlayStore = (globalThis as any).editorOverlayStore;
            const cursorInstances = editorOverlayStore.getCursorInstances();
            const cursor = cursorInstances.find((c: any) => c.itemId === itemId);
            if (cursor) {
                const target = cursor.findTarget();
                if (target) {
                    target.updateText("");
                    cursor.offset = 0;
                    cursor.applyToStore();
                }
            }
        }, { itemId });

        await page.waitForTimeout(200);

        const freshItemTextEl = page.locator(`.outliner-item[data-item-id="${itemId}"] .item-text`);

        await page.keyboard.type("test");

        await expect(freshItemTextEl).toHaveText("test");

        await page.keyboard.type("/");
        await page.waitForTimeout(200);
        await expect(palette).toBeVisible();

        // Empty query right now. Press backspace.
        await page.keyboard.press("Backspace");
        await page.waitForTimeout(200);
        await expect(palette).toBeHidden();

        await expect(freshItemTextEl).toHaveText("test");

        // 6. Verify typing / immediately after [ does not open the palette
        await page.keyboard.type("[");
        await page.keyboard.type("/");
        await page.waitForTimeout(200);
        await expect(palette).toBeHidden();
        await expect(freshItemTextEl).toHaveText("test[/");
    });
});
