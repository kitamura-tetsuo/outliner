import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
/** @feature IME-c4e7a2d9
 *  Title   : Shared input proxy does not soft-wrap — composition editing results are unchanged
 *  Source  : docs/client-features/ime-proxy-textarea-no-soft-wrap-c4e7a2d9.yaml
 */
import { expect, type Page, test } from "@playwright/test";
import { activateItemByText, canonicalTexts, itemText, nativeIme, readProxyLayout } from "../utils/imeProxyHelpers";
import { TestHelpers } from "../utils/testHelpers";

const localCursors = (page: Page) =>
    page.evaluate(() => {
        const store = (globalThis as any).editorOverlayStore;
        return Object.values(store.cursors as Record<string, any>)
            .filter((c) => (c.userId || "local") === "local")
            .map((c) => ({ itemId: c.itemId as string, offset: c.offset as number }))
            .sort((a, b) => a.itemId.localeCompare(b.itemId));
    });

/** Places the single local caret between "prefix" and "suffix" via ordinary keys. */
async function caretAfterPrefix(page: Page, text: string) {
    const itemId = await activateItemByText(page, text);
    await page.keyboard.press("Home");
    for (let i = 0; i < "prefix".length; i++) await page.keyboard.press("ArrowRight");
    await expect.poll(() => localCursors(page)).toEqual([{ itemId, offset: 6 }]);
    return itemId;
}

test.describe("IME-c4e7a2d9: composition results with the non-wrapping proxy", () => {
    test("confirming 日本 inserts it between prefix and suffix with the caret after it", async ({ page }, testInfo) => {
        await TestHelpers.seedProjectAndNavigate(page, testInfo, ["prefixsuffix"]);
        const itemId = await caretAfterPrefix(page, "prefixsuffix");
        expect((await readProxyLayout(page)).wrap).toBe("off");

        const session = await nativeIme(page);
        await session.compose("にほん");
        await expect.poll(() => itemText(page, itemId)).toBe("prefixにほんsuffix");
        await session.commit("日本");

        await expect.poll(() => itemText(page, itemId)).toBe("prefix日本suffix");
        await expect.poll(() => localCursors(page)).toEqual([{ itemId, offset: 8 }]);
        const stored = await canonicalTexts(page);
        expect(stored).toContain("prefix日本suffix");
        expect(stored.filter((t) => t.includes("日本"))).toEqual(["prefix日本suffix"]);
        const layout = await readProxyLayout(page);
        expect(layout.value).toBe("prefix日本suffix");
        expect(layout.wrap).toBe("off");
    });

    test("cancelling restores the pre-composition text and caret", async ({ page }, testInfo) => {
        await TestHelpers.seedProjectAndNavigate(page, testInfo, ["prefixsuffix"]);
        const itemId = await caretAfterPrefix(page, "prefixsuffix");

        const session = await nativeIme(page);
        await session.compose("にほん");
        await expect.poll(() => itemText(page, itemId)).toBe("prefixにほんsuffix");
        await session.cancel();

        await expect.poll(() => itemText(page, itemId)).toBe("prefixsuffix");
        await expect.poll(() => localCursors(page)).toEqual([{ itemId, offset: 6 }]);
        const stored = await canonicalTexts(page);
        expect(stored).toContain("prefixsuffix");
        expect(stored.some((t) => t.includes("にほん"))).toBe(false);
        expect((await readProxyLayout(page)).wrap).toBe("off");
    });

    test(
        "composition reaches both local carets in separate items without adding or losing cursors",
        async ({ page }, testInfo) => {
            await TestHelpers.seedProjectAndNavigate(page, testInfo, ["prefixsuffix", "prefixtail"]);
            const firstId = await caretAfterPrefix(page, "prefixsuffix");
            const secondId = await page.locator(".outliner-item").filter({
                has: page.locator(".item-text", { hasText: "prefixtail" }),
            }).getAttribute("data-item-id");
            expect(secondId).not.toBeNull();

            await page.evaluate((id) => {
                const store = (globalThis as any).editorOverlayStore;
                store.addCursor({ itemId: id, offset: 6, isActive: true, userId: "local" });
            }, secondId);
            const expectedBefore = [{ itemId: firstId, offset: 6 }, { itemId: secondId!, offset: 6 }]
                .sort((a, b) => a.itemId.localeCompare(b.itemId));
            await expect.poll(() => localCursors(page)).toEqual(expectedBefore);
            await page.locator("textarea.global-textarea").focus();

            const session = await nativeIme(page);
            await session.compose("にほん");
            await expect.poll(() => itemText(page, firstId)).toBe("prefixにほんsuffix");
            await expect.poll(() => itemText(page, secondId!)).toBe("prefixにほんtail");
            await session.commit("日本");

            await expect.poll(() => itemText(page, firstId)).toBe("prefix日本suffix");
            await expect.poll(() => itemText(page, secondId!)).toBe("prefix日本tail");
            await expect.poll(() => localCursors(page)).toEqual(
                expectedBefore.map((c) => ({ ...c, offset: 8 })),
            );
            expect((await readProxyLayout(page)).wrap).toBe("off");
        },
    );
});
