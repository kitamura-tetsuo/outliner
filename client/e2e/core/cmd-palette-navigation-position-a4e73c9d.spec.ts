/** @feature CMD-0001 */
import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";
import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();

test("pending palette refresh is rejected when Svelte navigation unmounts its target", async ({ page }, testInfo) => {
    await TestHelpers.seedProjectAndNavigate(page, testInfo, ["navigation target"]);
    const itemId = await TestHelpers.getItemIdByIndex(page, 1);
    if (!itemId) throw new Error("Navigation target not found");
    const itemSelector = `.outliner-item[data-item-id="${itemId}"] .item-text`;
    const itemText = page.locator(itemSelector);
    const outlinePath = new URL(page.url()).pathname;

    await TestHelpers.clickItemToEdit(page, itemSelector);
    await page.keyboard.press("End");
    await page.keyboard.type("/");
    await expect(itemText).toHaveText("navigation target/");
    await expect(page.locator(".slash-command-palette")).toBeVisible();

    const pendingAtNavigation = await page.evaluate(async () => {
        const nativeRequestAnimationFrame = globalThis.requestAnimationFrame.bind(globalThis);
        let pendingRefresh: FrameRequestCallback | undefined;
        globalThis.requestAnimationFrame = callback => {
            pendingRefresh = callback;
            return 1;
        };

        document.dispatchEvent(new Event("scroll"));
        for (let attempt = 0; attempt < 10 && !pendingRefresh; attempt++) await Promise.resolve();
        globalThis.requestAnimationFrame = nativeRequestAnimationFrame;
        if (!pendingRefresh) throw new Error("Scroll refresh did not reach its pending layout frame");

        const graphLink = document.querySelector<HTMLAnchorElement>('a[href$="/-/graph"]');
        if (!graphLink) throw new Error("Svelte graph navigation link not rendered");
        graphLink.click();

        const testGlobal = globalThis as typeof globalThis & {
            __releasePendingPaletteRefresh?: () => void;
            commandPaletteStore?: { isVisible: boolean; };
        };
        testGlobal.__releasePendingPaletteRefresh = () => pendingRefresh?.(performance.now());
        return testGlobal.commandPaletteStore?.isVisible;
    });
    expect(pendingAtNavigation).toBe(true);

    await expect(page).toHaveURL(/\/-\/graph$/);
    await expect(page.getByRole("heading", { name: "Graph View" })).toBeVisible();
    await expect(page.locator(".slash-command-palette")).toHaveCount(0);
    await expect.poll(() =>
        page.evaluate(() => {
            const store = globalThis.commandPaletteStore as { isVisible?: boolean; } | undefined;
            return store?.isVisible;
        })
    ).toBe(false);

    await page.evaluate(() => {
        const testGlobal = globalThis as typeof globalThis & { __releasePendingPaletteRefresh?: () => void; };
        testGlobal.__releasePendingPaletteRefresh?.();
        delete testGlobal.__releasePendingPaletteRefresh;
    });
    await expect.poll(() =>
        page.evaluate(() => {
            const store = globalThis.commandPaletteStore as { isVisible?: boolean; } | undefined;
            return store?.isVisible;
        })
    ).toBe(false);
    await expect(page.locator(".slash-command-palette")).toHaveCount(0);

    const returnLink = page.locator(`main a[href="${outlinePath}"]`);
    await expect(returnLink).toBeVisible();
    await returnLink.click();
    await expect(page).toHaveURL(new RegExp(`${outlinePath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`));

    const returnedItem = page.locator(itemSelector);
    await expect(returnedItem).toHaveText("navigation target/");
    await TestHelpers.clickItemToEdit(page, itemSelector);
    await page.keyboard.press("End");
    await page.keyboard.type("x");
    await expect(returnedItem).toHaveText("navigation target/x");
    await expect(page.locator(".slash-command-palette")).toBeHidden();
});
