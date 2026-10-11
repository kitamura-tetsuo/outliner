import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
/** @feature IME-c4e7a2d9
 *  Title   : Shared input proxy does not soft-wrap (Firefox/Fcitx5 IME candidate placement)
 *  Source  : docs/client-features/ime-proxy-textarea-no-soft-wrap-c4e7a2d9.yaml
 */
import { expect, test } from "@playwright/test";
import {
    activateItemByText,
    expectSingleRowOverflowing,
    itemText,
    nativeIme,
    readProxyLayout,
} from "../utils/imeProxyHelpers";
import { TestHelpers } from "../utils/testHelpers";

const PREFIX = "The quick brown fox jumps over the lazy dog and keeps running far away";

test.describe("IME-c4e7a2d9: shared input proxy never soft-wraps", () => {
    test(
        "wrap is off from first render and the real layout stays on one row through the composition lifecycle",
        async ({ page }, testInfo) => {
            test.setTimeout(120000);
            await TestHelpers.seedProjectAndNavigate(page, testInfo, [PREFIX]);

            // Initial render, before any activation or composition.
            await expect(page.locator("textarea.global-textarea")).toHaveAttribute("wrap", "off");

            const itemId = await activateItemByText(page, PREFIX);
            await page.keyboard.press("End");
            // Ordinary typing populates the input mirror with the long logical line.
            await page.keyboard.type(" typed");
            const typed = `${PREFIX} typed`;
            await expect.poll(() => itemText(page, itemId)).toBe(typed);

            let layout = await readProxyLayout(page);
            expect(layout.focused).toBe(true);
            expect(layout.value).toBe(typed);
            expectSingleRowOverflowing(layout);

            const session = await nativeIme(page);

            // Composition start + growth with the normal production sizing.
            await session.compose("あああああ");
            await expect.poll(() => itemText(page, itemId)).toBe(`${typed}あああああ`);
            layout = await readProxyLayout(page);
            expect(layout.value).toBe(`${typed}あああああ`);
            expectSingleRowOverflowing(layout);

            const longReading = "あああああいいいいいうううううえええええおおおおお";
            await session.compose(longReading);
            await expect.poll(() => itemText(page, itemId)).toBe(`${typed}${longReading}`);
            layout = await readProxyLayout(page);
            expect(layout.value).toBe(`${typed}${longReading}`);
            expectSingleRowOverflowing(layout);

            // Shrink.
            await session.compose("ああ");
            await expect.poll(() => itemText(page, itemId)).toBe(`${typed}ああ`);
            expectSingleRowOverflowing(await readProxyLayout(page));

            // Confirmation.
            await session.commit("日本");
            await expect.poll(() => itemText(page, itemId)).toBe(`${typed}日本`);
            layout = await readProxyLayout(page);
            expect(layout.value).toBe(`${typed}日本`);
            expectSingleRowOverflowing(layout);

            // Second composition, then cancellation.
            await session.compose("かかかかかかかかかか");
            await expect.poll(() => itemText(page, itemId)).toBe(`${typed}日本かかかかかかかかかか`);
            expectSingleRowOverflowing(await readProxyLayout(page));
            await session.cancel();
            await expect.poll(() => itemText(page, itemId)).toBe(`${typed}日本`);
            layout = await readProxyLayout(page);
            expect(layout.value).toBe(`${typed}日本`);
            expectSingleRowOverflowing(layout);

            // Fresh reload / remount of the production component.
            await page.reload();
            await TestHelpers.waitForOutlinerItems(page);
            await expect(page.locator("textarea.global-textarea")).toHaveAttribute("wrap", "off");
            await activateItemByText(page, `${typed}日本`);
            await page.keyboard.press("End");
            await session.compose("さらに長い入力を続けます");
            expectSingleRowOverflowing(await readProxyLayout(page));
            await session.commit("更に");
            await expect.poll(async () => (await readProxyLayout(page)).value).toBe(`${typed}日本更に`);
            expectSingleRowOverflowing(await readProxyLayout(page));
        },
    );

    test(
        "negative control: the layout oracle detects soft wrapping when it is restored",
        async ({ page }, testInfo) => {
            test.setTimeout(90000);
            await TestHelpers.seedProjectAndNavigate(page, testInfo, [PREFIX]);
            const itemId = await activateItemByText(page, PREFIX);
            await page.keyboard.press("End");

            const session = await nativeIme(page);
            await session.compose("あああああ");
            await expect.poll(() => itemText(page, itemId)).toBe(`${PREFIX}あああああ`);
            const off = await readProxyLayout(page);
            expectSingleRowOverflowing(off);

            // Mutation check only: restore soft wrapping on the same element, same value and size.
            await page.evaluate(() => {
                document.querySelector("textarea.global-textarea")!.setAttribute("wrap", "soft");
            });
            const soft = await readProxyLayout(page);
            expect(soft.value).toBe(off.value);
            expect(soft.clientWidth).toBe(off.clientWidth);
            expect(soft.rows).toBeGreaterThan(1);
            expect(soft.scrollHeight).toBeGreaterThan(off.scrollHeight);
        },
    );
});
