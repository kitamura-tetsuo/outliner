/** @feature CMD-0001 */
import { expect, type Locator, type Page, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";
import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();

async function holdAnimationFrames(page: Page) {
    await page.evaluate(() => {
        const nativeRequestAnimationFrame = globalThis.requestAnimationFrame.bind(globalThis);
        const callbacks: FrameRequestCallback[] = [];
        const testGlobal = globalThis as typeof globalThis & {
            __paletteFrameGate?: {
                callbacks: FrameRequestCallback[];
                nativeRequestAnimationFrame: typeof requestAnimationFrame;
            };
        };
        testGlobal.__paletteFrameGate = { callbacks, nativeRequestAnimationFrame };
        globalThis.requestAnimationFrame = callback => {
            callbacks.push(callback);
            return callbacks.length;
        };
    });
}

async function expectPendingPaletteHidden(page: Page) {
    await expect.poll(() =>
        page.evaluate(() => {
            const testGlobal = globalThis as typeof globalThis & {
                __paletteFrameGate?: { callbacks: FrameRequestCallback[]; };
                commandPaletteStore?: { hasValidPosition: boolean; isVisible: boolean; };
            };
            return (testGlobal.__paletteFrameGate?.callbacks.length ?? 0) > 0
                && testGlobal.commandPaletteStore?.hasValidPosition === false
                && testGlobal.commandPaletteStore.isVisible;
        })
    ).toBe(true);

    await page.evaluate(async () => {
        const testGlobal = globalThis as typeof globalThis & {
            __paletteFrameGate?: { nativeRequestAnimationFrame: typeof requestAnimationFrame; };
        };
        const nativeRequestAnimationFrame = testGlobal.__paletteFrameGate?.nativeRequestAnimationFrame;
        if (!nativeRequestAnimationFrame) throw new Error("Palette frame gate is unavailable");
        globalThis.requestAnimationFrame = nativeRequestAnimationFrame;
        await new Promise<void>(resolve => nativeRequestAnimationFrame(() => resolve()));
        await new Promise<void>(resolve => nativeRequestAnimationFrame(() => resolve()));
    });

    await expect(page.locator(".slash-command-palette")).toHaveCSS("display", "none");
    expect(
        await page.locator(".slash-command-palette").evaluate(element => {
            const rect = element.getBoundingClientRect();
            return { height: rect.height, width: rect.width };
        }),
    ).toEqual({ height: 0, width: 0 });
}

async function releaseAnimationFrames(page: Page) {
    await page.evaluate(() => {
        const testGlobal = globalThis as typeof globalThis & {
            __paletteFrameGate?: { callbacks: FrameRequestCallback[]; };
        };
        const gate = testGlobal.__paletteFrameGate;
        if (!gate) throw new Error("Palette frame gate is unavailable");
        for (const callback of gate.callbacks.splice(0)) callback(performance.now());
        delete testGlobal.__paletteFrameGate;
    });
}

async function expectPaletteAtCaret(itemText: Locator) {
    await expect.poll(() =>
        itemText.evaluate(element => {
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
        })
    ).toBe(true);
}

test(
    "does not display origin or previous-session geometry while initial measurement is pending",
    async ({ page }, testInfo) => {
        await TestHelpers.seedProjectAndNavigate(page, testInfo, ["first target", "second target"]);
        const firstId = await TestHelpers.getItemIdByIndex(page, 1);
        const secondId = await TestHelpers.getItemIdByIndex(page, 2);
        if (!firstId || !secondId) throw new Error("Seeded items not found");

        const first = page.locator(`.outliner-item[data-item-id="${firstId}"] .item-text`);
        await TestHelpers.clickItemToEdit(page, `.outliner-item[data-item-id="${firstId}"] .item-text`);
        await page.keyboard.press("End");
        await holdAnimationFrames(page);
        await page.keyboard.type("/");
        await expectPendingPaletteHidden(page);
        await releaseAnimationFrames(page);
        await expectPaletteAtCaret(first);

        await page.keyboard.press("Escape");
        const second = page.locator(`.outliner-item[data-item-id="${secondId}"] .item-text`);
        await TestHelpers.clickItemToEdit(page, `.outliner-item[data-item-id="${secondId}"] .item-text`);
        await page.keyboard.press("End");
        await holdAnimationFrames(page);
        await page.keyboard.type("/");
        await expectPendingPaletteHidden(page);
        await releaseAnimationFrames(page);
        await expectPaletteAtCaret(second);
        await expect(first).toHaveText("first target/");
        await expect(second).toHaveText("second target/");
    },
);
