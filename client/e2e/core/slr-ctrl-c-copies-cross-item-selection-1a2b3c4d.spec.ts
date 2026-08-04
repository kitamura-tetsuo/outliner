import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

test.describe("Ctrl+C copies cross-item selection", () => {
    test("copies exact selected text via mouse drag", async ({ page }) => {
        await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
        const items = ["Line 1", "Line 2", "Line 3"];
        await TestHelpers.seedProjectAndNavigate(page, test.info(), items);

        const item1 = page.locator(".item-text").nth(0);
        const item3 = page.locator(".item-text").nth(3);
        await item1.hover();
        await page.mouse.down();
        await item3.hover();
        await page.mouse.up();

        await page.keyboard.press("Control+c");
        await page.waitForTimeout(300);

        const clipboardText = await page.evaluate(() => navigator.clipboard.readText());
        expect(clipboardText).toBe("Line 1\nLine 2\nLine 3");
    });

    test("copies exact selected text via Shift+ArrowDown", async ({ page }) => {
        await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
        const items = ["Line 1", "Line 2", "Line 3"];
        await TestHelpers.seedProjectAndNavigate(page, test.info(), items);

        const item1 = page.locator(".item-text").nth(0);
        await item1.click();
        await page.keyboard.press("Shift+ArrowDown");
        await page.keyboard.press("Shift+ArrowDown");
        await page.keyboard.press("Shift+ArrowDown");

        await page.keyboard.press("Control+c");
        await page.waitForTimeout(300);

        const clipboardText = await page.evaluate(() => navigator.clipboard.readText());
        expect(clipboardText).toBe("Line 1\nLine 2\nLine 3");
    });
});
