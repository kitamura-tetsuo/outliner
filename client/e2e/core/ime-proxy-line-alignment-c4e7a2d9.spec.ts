import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
/** @feature IME-c4e7a2d9
 *  Title   : Shared input proxy line coincides with the displayed composing line
 *  Source  : docs/client-features/ime-proxy-textarea-no-soft-wrap-c4e7a2d9.yaml
 */
import { expect, type Page, test } from "@playwright/test";
import { activateItemByText, itemText, nativeIme } from "../utils/imeProxyHelpers";
import { TestHelpers } from "../utils/testHelpers";

// The native IME anchors its candidate window to the caret inside the proxy textarea. That
// caret must start where the displayed composition starts: same left edge, same line box.
const alignment = (page: Page, itemId: string, start: number) =>
    page.evaluate(([id, offset]) => {
        const ta = document.querySelector("textarea.global-textarea") as HTMLTextAreaElement;
        const el = document.querySelector(`.outliner-item[data-item-id="${id}"] .item-text`) as HTMLElement;
        const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
        let node: Node | null, rest = offset as number, glyph: DOMRect | undefined;
        while ((node = walker.nextNode())) {
            const length = node.textContent?.length ?? 0;
            if (rest < length) {
                const range = document.createRange();
                range.setStart(node, rest);
                range.setEnd(node, rest + 1);
                glyph = range.getBoundingClientRect();
                break;
            }
            rest -= length;
        }
        const style = getComputedStyle(ta), lineHeight = parseFloat(getComputedStyle(el).lineHeight);
        const proxy = ta.getBoundingClientRect();
        return {
            padding: [style.paddingTop, style.paddingLeft],
            border: [style.borderTopWidth, style.borderLeftWidth],
            leftDelta: glyph ? proxy.left - glyph.left : NaN,
            // Line box top of the displayed glyph under CSS half-leading.
            topDelta: glyph ? proxy.top - (glyph.top - (lineHeight - glyph.height) / 2) : NaN,
            proxyLineHeight: parseFloat(style.lineHeight),
            lineHeight,
        };
    }, [itemId, start] as const);

test.describe("IME-c4e7a2d9: proxy caret line matches the displayed composition", () => {
    for (const prefix of ["", "prefix"]) {
        test(`composition ${prefix ? "after existing text" : "in an empty item"}`, async ({ page }, testInfo) => {
            const seed = prefix || "seed";
            await TestHelpers.seedProjectAndNavigate(page, testInfo, [seed]);
            const itemId = await activateItemByText(page, seed);
            await page.keyboard.press("End");
            if (!prefix) {
                for (let i = 0; i < seed.length; i++) await page.keyboard.press("Backspace");
                await expect.poll(() => itemText(page, itemId)).toBe("");
            }
            const session = await nativeIme(page);
            for (const text of ["あああああ", "あ".repeat(40), "あ".repeat(10)]) {
                await session.compose(text);
                await expect.poll(() => itemText(page, itemId)).toBe(prefix + text);
                const measured = await alignment(page, itemId, prefix.length);
                expect(measured.padding).toEqual(["0px", "0px"]);
                expect(measured.border).toEqual(["0px", "0px"]);
                expect(measured.proxyLineHeight).toBe(measured.lineHeight);
                expect(Math.abs(measured.leftDelta)).toBeLessThanOrEqual(1);
                expect(Math.abs(measured.topDelta)).toBeLessThanOrEqual(1);
            }
            await session.cancel();
            await expect.poll(() => itemText(page, itemId)).toBe(prefix);
        });
    }
});
