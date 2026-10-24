/** @feature CMD-0001 */
import { expect, type Locator, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";
import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();

async function expectPaletteAtCaret(itemText: Locator) {
    await expect.poll(async () => {
        return await itemText.evaluate((element) => {
            const palette = document.querySelector(".slash-command-palette");
            if (!palette) return false;
            const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
            let last: Text | undefined;
            while (walker.nextNode()) last = walker.currentNode as Text;
            if (!last) return undefined;
            const range = document.createRange();
            range.setStart(last, last.textContent?.length ?? 0);
            range.collapse(true);
            const caret = range.getClientRects()[0];
            const menu = palette.getBoundingClientRect();
            if (!caret || menu.height === 0) return false;
            return Math.abs(menu.left - caret.left) <= 2
                && Math.abs(menu.top - caret.bottom - 4) <= 2;
        });
    }).toBe(true);
}

test.describe("slash command palette caret position", () => {
    test("anchors to the caret after window scrolling", async ({ page }, testInfo) => {
        const lines = Array.from({ length: 40 }, (_, index) => `scroll row ${index}`);
        await TestHelpers.seedProjectAndNavigate(page, testInfo, lines);
        const itemId = await TestHelpers.getItemIdByIndex(page, 38);
        if (!itemId) throw new Error("Scrolled item not found");
        const itemText = page.locator(`.outliner-item[data-item-id="${itemId}"] .item-text`);
        await itemText.scrollIntoViewIfNeeded();
        expect(await page.evaluate(() => globalThis.scrollY)).toBeGreaterThan(0);
        await TestHelpers.clickItemToEdit(page, `.outliner-item[data-item-id="${itemId}"] .item-text`);
        await page.keyboard.press("End");
        await page.keyboard.type("/");
        await expectPaletteAtCaret(itemText);
    });

    test("anchors after the complete formatted prefix", async ({ page }, testInfo) => {
        await TestHelpers.seedProjectAndNavigate(page, testInfo, ["prefix [[bold]] suffix"]);
        const itemId = await TestHelpers.getItemIdByIndex(page, 1);
        if (!itemId) throw new Error("Formatted item not found");
        const itemText = page.locator(`.outliner-item[data-item-id="${itemId}"] .item-text`);
        await TestHelpers.clickItemToEdit(page, `.outliner-item[data-item-id="${itemId}"] .item-text`);
        await expect.poll(() => itemText.locator("span").count()).toBeGreaterThan(0);
        await page.keyboard.press("End");
        await page.keyboard.type("/");
        await expect(itemText).toHaveText("prefix [[bold]] suffix/");
        await expectPaletteAtCaret(itemText);
    });

    test("does not revive a palette closed while measurement is pending", async ({ page }, testInfo) => {
        await TestHelpers.seedProjectAndNavigate(page, testInfo, ["first", "second"]);
        const firstId = await TestHelpers.getItemIdByIndex(page, 1);
        const secondId = await TestHelpers.getItemIdByIndex(page, 2);
        if (!firstId || !secondId) throw new Error("Seeded items not found");

        const firstText = page.locator(`.outliner-item[data-item-id="${firstId}"] .item-text`);
        await TestHelpers.clickItemToEdit(page, `.outliner-item[data-item-id="${firstId}"] .item-text`);
        await page.keyboard.press("End");
        await page.keyboard.type("/");
        await page.keyboard.press("Escape");
        await expect(page.locator(".slash-command-palette")).toBeHidden();
        await page.keyboard.type("x");
        await expect(firstText).toHaveText("first/x");

        const secondText = page.locator(`.outliner-item[data-item-id="${secondId}"] .item-text`);
        await TestHelpers.clickItemToEdit(page, `.outliner-item[data-item-id="${secondId}"] .item-text`);
        await page.keyboard.press("End");
        await page.keyboard.type("/");
        await expectPaletteAtCaret(secondText);
        await expect(firstText).toHaveText("first/x");
    });
});
