import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
/** @feature IME-c4e7a2d9
 *  Title   : Shared input proxy does not soft-wrap — rendered document still wraps and follows the caret
 *  Source  : docs/client-features/ime-proxy-textarea-no-soft-wrap-c4e7a2d9.yaml
 */
import { expect, type Page, test } from "@playwright/test";
import {
    activateItemByText,
    expectSingleRowOverflowing,
    itemText,
    nativeIme,
    readProxyLayout,
} from "../utils/imeProxyHelpers";
import { TestHelpers } from "../utils/testHelpers";

const LONG = "This item is long enough to wrap onto several rendered lines in a narrow content area";

const documentLayout = (page: Page, itemId: string) =>
    page.evaluate((id) => {
        const text = document.querySelector(`.outliner-item[data-item-id="${id}"] .item-text`) as HTMLElement;
        const style = getComputedStyle(text);
        const lineHeight = parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.2;
        // An ordinary textarea outside the editor: its wrapping must not be affected by the proxy policy.
        const probe = document.createElement("textarea");
        probe.style.width = "60px";
        probe.value = "an ordinary textarea keeps soft wrapping";
        document.body.appendChild(probe);
        const probeWraps = probe.scrollHeight > probe.clientHeight * 1.5 && probe.scrollWidth <= probe.clientWidth;
        probe.remove();
        return {
            renderedRows: Math.round(text.getBoundingClientRect().height / lineHeight),
            documentScrollWidth: document.documentElement.scrollWidth,
            viewportWidth: document.documentElement.clientWidth,
            probeWraps,
        };
    }, itemId);

const caretInViewport = (page: Page) =>
    page.evaluate(() => {
        const rect = document.querySelector(".cursor.active")?.getBoundingClientRect();
        return !!rect && rect.top >= 0 && rect.bottom <= globalThis.innerHeight;
    });

/**
 * Document scroll width with the proxy as shipped, and with soft wrapping restored on the same
 * element (mutation check) for unchanged content, caret and viewport.
 */
async function scrollWidthOffVsSoft(page: Page) {
    const setWrap = (wrap: string) =>
        page.evaluate((w) => document.querySelector("textarea.global-textarea")!.setAttribute("wrap", w), wrap);
    const read = () => page.evaluate(() => document.documentElement.scrollWidth);
    const off = await read();
    await setWrap("soft");
    const soft = await read();
    await setWrap("off");
    return { off, soft };
}

test.describe("IME-c4e7a2d9: proxy non-wrapping is confined to the input proxy", () => {
    test("rendered item wraps, caret is followed and document width is not increased", async ({ page }, testInfo) => {
        test.setTimeout(120000);
        await page.setViewportSize({ width: 375, height: 600 });
        const lines = [...Array.from({ length: 12 }, (_, i) => `Filler ${i + 1}`), LONG];
        await TestHelpers.seedProjectAndNavigate(page, testInfo, lines);
        const itemId = await activateItemByText(page, LONG);
        await page.keyboard.press("End");

        // Idle editing state: the 1px proxy holds the whole long line without widening the page.
        expectSingleRowOverflowing(await readProxyLayout(page));
        const idle = await documentLayout(page, itemId);
        expect(idle.documentScrollWidth).toBeLessThanOrEqual(idle.viewportWidth);
        const idleWidths = await scrollWidthOffVsSoft(page);
        expect(idleWidths.off).toBeLessThanOrEqual(idleWidths.soft);

        const session = await nativeIme(page);
        let composed = "";
        for (let i = 0; i < 12; i++) {
            composed += "あいうえお";
            await session.compose(composed);
        }
        await expect.poll(() => itemText(page, itemId)).toBe(`${LONG}${composed}`);

        // The input proxy itself does not soft-wrap...
        expectSingleRowOverflowing(await readProxyLayout(page));
        // ...while the rendered item still wraps at its width and the current caret stays visible.
        const narrow = await documentLayout(page, itemId);
        expect(narrow.renderedRows).toBeGreaterThan(2);
        await expect.poll(() => caretInViewport(page), { timeout: 10000 }).toBe(true);
        // Other text controls keep their own wrapping.
        expect(narrow.probeWraps).toBe(true);
        // The non-wrapping policy does not increase the document scroll width.
        let widths = await scrollWidthOffVsSoft(page);
        expect(widths.off).toBeLessThanOrEqual(widths.soft);

        // Resize: a global nowrap rule would stop the item from re-wrapping, and an oversized
        // proxy would show up as extra document width at some viewport.
        await page.setViewportSize({ width: 320, height: 600 });
        await expect.poll(async () => (await documentLayout(page, itemId)).renderedRows)
            .toBeGreaterThanOrEqual(narrow.renderedRows);
        const narrower = await documentLayout(page, itemId);
        expectSingleRowOverflowing(await readProxyLayout(page));
        widths = await scrollWidthOffVsSoft(page);
        expect(widths.off).toBeLessThanOrEqual(widths.soft);

        await page.setViewportSize({ width: 900, height: 600 });
        await expect.poll(async () => (await documentLayout(page, itemId)).renderedRows)
            .toBeLessThan(narrower.renderedRows);
        widths = await scrollWidthOffVsSoft(page);
        expect(widths.off).toBeLessThanOrEqual(widths.soft);

        await session.commit(composed);
        await expect.poll(() => itemText(page, itemId)).toBe(`${LONG}${composed}`);
        expect((await readProxyLayout(page)).wrap).toBe("off");

        // After confirmation the proxy shrinks back and the page has no horizontal overflow.
        await expect.poll(async () => {
            const layout = await documentLayout(page, itemId);
            return layout.documentScrollWidth <= layout.viewportWidth;
        }).toBe(true);
    });
});
