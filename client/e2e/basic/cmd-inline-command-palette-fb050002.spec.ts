import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers.js";

/** @feature CMD-0001 */
test.describe("Inline Command Palette", () => {
    test("typing / opens palette and can select alias or yjstable", async ({ page }) => {
        // seed with an empty line
        await TestHelpers.seedProjectAndNavigate(page, test.info(), ["Test"]);
        await TestHelpers.waitForOutlinerItems(page, 2); // title + item

        const itemSelector = ".outliner-item:not(.page-title)";
        await page.waitForSelector(itemSelector);

        // Click to focus
        await page.click(itemSelector);
        await TestHelpers.ensureCursorReady(page);

        const textElement = page.locator(`${itemSelector} .item-text`).first();

        // Ensure we're at the very end
        await page.keyboard.press("End");
        await page.keyboard.press("ArrowRight");
        await page.keyboard.press("ArrowRight");

        // Type a space first so we don't mess up "Test" with the known replacement bug
        await page.keyboard.type(" ");

        // Use Playwright `type` but wait properly.
        await page.keyboard.type("/");

        // Command palette should be visible
        const palette = page.locator('.slash-command-palette');
        await expect(palette).toBeVisible();

        const dbCommand = page.locator('[data-testid="command-item-yjstable"]');
        const aliasCommand = page.locator('[data-testid="command-item-alias"]');

        await expect(dbCommand).toBeVisible();
        await expect(aliasCommand).toBeVisible();

        // Type a filter `al`
        await page.keyboard.type("al");

        // The list should be narrowed down to Alias
        await expect(dbCommand).toBeHidden();
        await expect(aliasCommand).toBeVisible();

        // Down/Up move selection
        await page.keyboard.press("ArrowDown");
        await page.keyboard.press("ArrowUp");
        await expect(aliasCommand).toHaveAttribute("aria-selected", "true");

        // Escape closes the palette
        await page.keyboard.press("Escape");
        await expect(palette).toBeHidden();

        // Now test backspace
        await page.click(itemSelector);
        await page.keyboard.press("End");
        await page.keyboard.press("ArrowRight");
        await page.keyboard.press("ArrowRight");

        // delete "l"
        await page.keyboard.press("Backspace");
        // delete "a"
        await page.keyboard.press("Backspace");

        // Now trigger the palette again by typing /
        // delete the /
        await page.keyboard.press("Backspace");

        // type it again
        await page.keyboard.type("/");

        // Command palette should be visible
        await expect(palette).toBeVisible();

        // Backspace with an empty query removes the `/`
        await page.keyboard.press("Backspace");

        await expect.poll(async () => await textElement.textContent()).not.toContain("/");
        await expect(palette).toBeHidden();

        // / immediately after [ does not open the palette
        await page.keyboard.type("[");
        await page.keyboard.type("/");
        await expect(palette).toBeHidden();
    });
});
