/** @feature CMD-0001 */
import { expect, type Locator, type Page, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";
import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();

async function caretTop(itemText: Locator) {
    return await itemText.evaluate((element) => {
        const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
        let last: Text | undefined;
        while (walker.nextNode()) last = walker.currentNode as Text;
        if (!last) throw new Error("Editable text node not rendered");
        const range = document.createRange();
        range.setStart(last, last.length);
        range.collapse(true);
        const rect = range.getClientRects()[0];
        if (!rect) throw new Error("Caret rectangle not rendered");
        return rect.top;
    });
}

async function expectPaletteAtCaret(itemText: Locator) {
    await expect.poll(async () => {
        return await itemText.evaluate((element) => {
            const palette = document.querySelector(".slash-command-palette");
            const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
            let last: Text | undefined;
            while (walker.nextNode()) last = walker.currentNode as Text;
            if (!palette || !last) return false;
            const range = document.createRange();
            range.setStart(last, last.length);
            range.collapse(true);
            const caret = range.getClientRects()[0];
            const menu = palette.getBoundingClientRect();
            return !!caret && menu.height > 0 && Math.abs(menu.left - caret.left) <= 2
                && Math.abs(menu.top - caret.bottom - 4) <= 2;
        });
    }).toBe(true);
}

async function editingSnapshot(page: Page, itemText: Locator) {
    return {
        text: await itemText.textContent(),
        query: await page.locator(".slash-command-palette").getAttribute("data-query"),
        selected: await page.locator(".slash-command-palette [aria-selected=true]").getAttribute("id"),
        editor: await page.evaluate(() => ({
            activeTag: document.activeElement?.tagName,
            activeClass: document.activeElement?.className,
            cursors: globalThis.editorOverlayStore?.getLocalCursorInstances().map(cursor => ({
                itemId: cursor.itemId,
                offset: cursor.offset,
            })),
        })),
    };
}

test("tracks query wrapping and its Backspace reversal", async ({ page }, testInfo) => {
    const prefix = "wrap boundary words ".repeat(5);
    await page.setViewportSize({ width: 520, height: 700 });
    await TestHelpers.seedProjectAndNavigate(page, testInfo, [prefix]);
    const itemId = await TestHelpers.getItemIdByIndex(page, 1);
    if (!itemId) throw new Error("Wrapped item not found");
    const itemText = page.locator(`.outliner-item[data-item-id="${itemId}"] .item-text`);
    await TestHelpers.clickItemToEdit(page, `.outliner-item[data-item-id="${itemId}"] .item-text`);
    await page.keyboard.press("End");
    await page.keyboard.type("/");
    const initialTop = await caretTop(itemText);

    let typed = 0;
    for (; typed < 80 && await caretTop(itemText) === initialTop; typed++) {
        await page.keyboard.type("m");
    }
    expect(typed).toBeGreaterThan(0);
    expect(await caretTop(itemText)).toBeGreaterThan(initialTop);
    await expectPaletteAtCaret(itemText);

    while (await caretTop(itemText) !== initialTop && typed > 0) {
        await page.keyboard.press("Backspace");
        typed--;
    }
    expect(await caretTop(itemText)).toBe(initialTop);
    await expectPaletteAtCaret(itemText);
    await expect(itemText).toHaveText(`${prefix}/${"m".repeat(typed)}`);
});

test("tracks resize reflow and document scrolling without changing editing state", async ({ page }, testInfo) => {
    const lines = Array.from(
        { length: 45 },
        (_, index) => index === 22 ? "resize target words ".repeat(10) : `layout row ${index}`,
    );
    await page.setViewportSize({ width: 1000, height: 700 });
    await TestHelpers.seedProjectAndNavigate(page, testInfo, lines);
    const itemId = await TestHelpers.getItemIdByIndex(page, 23);
    if (!itemId) throw new Error("Resize target not found");
    const itemText = page.locator(`.outliner-item[data-item-id="${itemId}"] .item-text`);
    await itemText.scrollIntoViewIfNeeded();
    await TestHelpers.clickItemToEdit(page, `.outliner-item[data-item-id="${itemId}"] .item-text`);
    await page.keyboard.press("End");
    await page.keyboard.type("/mer");
    await expectPaletteAtCaret(itemText);
    const before = await editingSnapshot(page, itemText);
    const initialTop = await caretTop(itemText);

    let resizedTop = initialTop;
    for (const width of [800, 650, 500, 400]) {
        await page.setViewportSize({ width, height: 700 });
        resizedTop = await caretTop(itemText);
        if (resizedTop !== initialTop) break;
    }
    expect(resizedTop).not.toBe(initialTop);
    await expectPaletteAtCaret(itemText);
    expect(await editingSnapshot(page, itemText)).toEqual(before);

    const oldScrollY = await page.evaluate(() => scrollY);
    await page.evaluate(() => scrollBy(0, 100));
    await expect.poll(() => page.evaluate(() => scrollY)).not.toBe(oldScrollY);
    await expectPaletteAtCaret(itemText);
    expect(await editingSnapshot(page, itemText)).toEqual(before);
});
