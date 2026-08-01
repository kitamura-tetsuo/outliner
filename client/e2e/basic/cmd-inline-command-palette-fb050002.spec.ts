/** @feature CMD-0001 */
import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";
import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();

test.describe("Inline Command Palette Acceptance Criteria", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        await TestHelpers.seedProjectAndNavigate(page, testInfo, ["item1"]);
        await TestHelpers.waitForOutlinerItems(page);
    });

    test("typing / opens palette and filters to Alias", async ({ page }) => {
        const item1Id = await TestHelpers.getItemIdByIndex(page, 1);
        if (!item1Id) throw new Error("Item not found");

        await TestHelpers.clickItemToEdit(page, `.outliner-item[data-item-id="${item1Id}"] .item-text`);
        await page.waitForSelector(".cursor", { state: "visible" });

        // Typing / opens the palette
        await page.keyboard.type("/");
        const palette = page.locator(".slash-command-palette");
        await expect(palette).toBeVisible();

        // Check if options are visible
        const dbOption = page.locator('[data-testid="command-item-yjstable"]');
        const aliasOption = page.locator('[data-testid="command-item-alias"]');
        await expect(dbOption).toBeVisible();
        await expect(aliasOption).toBeVisible();

        // Type 'al' to narrow down to Alias
        await page.keyboard.type("al");
        await expect(palette).toHaveAttribute("data-query", "al");
        await expect(aliasOption).toBeVisible();
        await expect(dbOption).toBeHidden();

        // Test arrow up/down on the list without query
        await page.keyboard.press("Backspace");
        await page.keyboard.press("Backspace");
        await expect(palette).toHaveAttribute("data-query", "");

        await expect(dbOption).toHaveAttribute("aria-selected", "true");
        await page.keyboard.press("ArrowDown");
        await expect(aliasOption).toHaveAttribute("aria-selected", "true");
        await expect(dbOption).toHaveAttribute("aria-selected", "false");
        await page.keyboard.press("ArrowUp");
        await expect(dbOption).toHaveAttribute("aria-selected", "true");
        await expect(aliasOption).toHaveAttribute("aria-selected", "false");
    });

    test("Escape closes palette and leaves text unchanged", async ({ page }) => {
        const item1Id = await TestHelpers.getItemIdByIndex(page, 1);
        if (!item1Id) throw new Error("Item not found");

        await TestHelpers.clickItemToEdit(page, `.outliner-item[data-item-id="${item1Id}"] .item-text`);
        await page.keyboard.press("End");
        await page.keyboard.type(" text");

        const originalText = "item1 text";
        const itemText = page.locator(`.outliner-item[data-item-id="${item1Id}"] .item-text`);
        await expect(itemText).toHaveText(originalText);

        await page.keyboard.type("/");
        const palette = page.locator(".slash-command-palette");
        await expect(palette).toBeVisible();
        await expect(itemText).toHaveText(originalText + "/");

        // Type some filter
        await page.keyboard.type("dat");
        await expect(itemText).toHaveText(originalText + "/dat");

        // Press Escape
        await page.keyboard.press("Escape");
        await expect(palette).toBeHidden();

        await expect(itemText).toHaveText(originalText + "/dat");
    });

    test("Backspace with empty query removes / and restores original text exactly", async ({ page }) => {
        const item1Id = await TestHelpers.getItemIdByIndex(page, 1);
        if (!item1Id) throw new Error("Item not found");

        await TestHelpers.clickItemToEdit(page, `.outliner-item[data-item-id="${item1Id}"] .item-text`);
        await page.keyboard.press("End");
        await page.keyboard.type(" text");

        const originalText = "item1 text";
        const itemText = page.locator(`.outliner-item[data-item-id="${item1Id}"] .item-text`);
        await expect(itemText).toHaveText(originalText);

        // Open palette
        await page.keyboard.type("/");
        const palette = page.locator(".slash-command-palette");
        await expect(palette).toBeVisible();
        await expect(itemText).toHaveText(originalText + "/");

        // Empty query backspace
        await page.keyboard.press("Backspace");

        await expect(palette).toBeHidden();
        // The text should be exactly the original text (regression for duplication bug)
        await expect(itemText).toHaveText(originalText);
    });

    test("typing / immediately after [ does not open the palette", async ({ page }) => {
        const item1Id = await TestHelpers.getItemIdByIndex(page, 1);
        if (!item1Id) throw new Error("Item not found");

        await TestHelpers.clickItemToEdit(page, `.outliner-item[data-item-id="${item1Id}"] .item-text`);
        await page.keyboard.press("End");
        await page.keyboard.type(" [");

        // Type /
        await page.keyboard.type("/");

        const palette = page.locator(".slash-command-palette");
        await expect(palette).toBeHidden();

        const itemText = page.locator(`.outliner-item[data-item-id="${item1Id}"] .item-text`);
        await expect(itemText).toHaveText("item1 [/");
    });
});
