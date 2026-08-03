import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

test.describe("Cross-item copy", () => {
    test.beforeEach(async ({ context }) => {
        await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    });

    test("Ctrl+C copies cross-item selection (mouse drag)", async ({ page }) => {
        await TestHelpers.seedProjectAndNavigate(page, test.info(), [
            "First item",
            "Second item",
            "Third item",
        ]);

        const firstItem = page.locator(".outliner-item").nth(0).locator(".item-text");
        const thirdItem = page.locator(".outliner-item").nth(2).locator(".item-text");

        await firstItem.click();
        await firstItem.hover();
        await page.mouse.down();
        await thirdItem.hover();
        await page.mouse.up();

        await page.keyboard.press("Control+c");

        const clipboardText = await page.evaluate(() => navigator.clipboard.readText());
        expect(clipboardText).toBe("First item\nSecond item\nThird item");
    });

    test("Ctrl+C copies cross-item selection (Shift+ArrowDown)", async ({ page }) => {
        await TestHelpers.seedProjectAndNavigate(page, test.info(), [
            "Item A",
            "Item B",
            "Item C",
        ]);

        await page.locator(".outliner-item").nth(0).locator(".item-text").click();
        await page.keyboard.press("Shift+ArrowDown");
        await page.keyboard.press("Shift+ArrowDown");

        await page.keyboard.press("Control+c");

        const clipboardText = await page.evaluate(() => navigator.clipboard.readText());
        expect(clipboardText).toBe("Item A\nItem B\nItem C");
    });
});
