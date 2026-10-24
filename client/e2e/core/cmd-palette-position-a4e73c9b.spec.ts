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

    test("rejects a queued refresh after close and reopening on another target", async ({ page }, testInfo) => {
        await TestHelpers.seedProjectAndNavigate(page, testInfo, ["first", "second"]);
        const firstId = await TestHelpers.getItemIdByIndex(page, 1);
        const secondId = await TestHelpers.getItemIdByIndex(page, 2);
        if (!firstId || !secondId) throw new Error("Seeded items not found");

        const firstText = page.locator(`.outliner-item[data-item-id="${firstId}"] .item-text`);
        await TestHelpers.clickItemToEdit(page, `.outliner-item[data-item-id="${firstId}"] .item-text`);
        await page.keyboard.press("End");
        await page.keyboard.type("/");
        await expectPaletteAtCaret(firstText);

        // The scroll listener starts an async refresh which cannot pass its
        // Svelte tick until this browser task ends. Close A and open B through
        // the editor's real DOM input handlers before that task releases it.
        const overlap = await page.evaluate((newItemId) => {
            document.dispatchEvent(new Event("scroll"));
            const oldTextarea = document.activeElement;
            if (!(oldTextarea instanceof HTMLTextAreaElement)) {
                throw new Error("Editor textarea is not focused");
            }
            oldTextarea.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));

            const target = document.querySelector(`.outliner-item[data-item-id="${newItemId}"] .item-text`);
            if (!(target instanceof HTMLElement)) throw new Error("New command target not rendered");
            target.click();
            const textarea = document.activeElement;
            if (!(textarea instanceof HTMLTextAreaElement)) throw new Error("New editor did not receive focus");
            textarea.dispatchEvent(new KeyboardEvent("keydown", { key: "End", bubbles: true }));
            textarea.dispatchEvent(new KeyboardEvent("keydown", { key: "/", bubbles: true }));
            textarea.dispatchEvent(
                new InputEvent("input", {
                    data: "/",
                    inputType: "insertText",
                    bubbles: true,
                }),
            );
            return globalThis.editorOverlayStore?.getLocalCursorInstances().map(cursor => cursor.itemId);
        }, secondId);
        expect(overlap).toEqual([secondId]);

        const secondText = page.locator(`.outliner-item[data-item-id="${secondId}"] .item-text`);
        await expect(secondText).toHaveText("second/");
        await expectPaletteAtCaret(secondText);
        await expect(firstText).toHaveText("first/");
        await expect(secondText).toHaveText("second/");

        await page.keyboard.press("Escape");
        await page.keyboard.type("x");
        await expect(secondText).toHaveText("second/x");
    });

    test("settled unavailable target closes the session and releases input", async ({ page }, testInfo) => {
        await TestHelpers.seedProjectAndNavigate(page, testInfo, ["old target", "new target"]);
        const firstId = await TestHelpers.getItemIdByIndex(page, 1);
        const secondId = await TestHelpers.getItemIdByIndex(page, 2);
        if (!firstId || !secondId) throw new Error("Seeded items not found");
        const firstText = page.locator(`.outliner-item[data-item-id="${firstId}"] .item-text`);
        const secondText = page.locator(`.outliner-item[data-item-id="${secondId}"] .item-text`);

        await TestHelpers.clickItemToEdit(page, `.outliner-item[data-item-id="${firstId}"] .item-text`);
        await page.keyboard.press("End");
        await page.keyboard.type("/");
        await expectPaletteAtCaret(firstText);

        // Moving the sole local caret makes the recorded command target
        // unavailable. The settled production refresh must end the session,
        // rather than merely hiding its DOM while retaining interception.
        await TestHelpers.clickItemToEdit(page, `.outliner-item[data-item-id="${secondId}"] .item-text`);
        await expect(page.locator(".slash-command-palette")).toBeHidden();
        await page.keyboard.press("End");
        await page.keyboard.type("x");
        await expect(secondText).toHaveText("new targetx");
        await expect(firstText).toHaveText("old target/");
    });
});
