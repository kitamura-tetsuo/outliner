import "../utils/registerAfterEachSnapshot";
import { expect, test } from "@playwright/test";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
import { TestHelpers } from "../utils/testHelpers";
registerCoverageHooks();

test.describe("Shift+right-click yields to the browser native menu (#5407)", () => {
    test("native gesture opens no app menu and leaves the event uncancelled", async ({ page }, testInfo) => {
        test.setTimeout(120000);

        await TestHelpers.seedProjectAndNavigate(page, testInfo, [
            "Native escape item",
            "Second item",
        ]);
        await TestHelpers.waitForOutlinerItems(page, 2);

        const firstItemId = await TestHelpers.getItemIdByIndex(page, 1);
        expect(firstItemId).not.toBeNull();
        const firstItem = page.locator(`.outliner-item[data-item-id="${firstItemId}"]`);

        // Observe the real event after the full application dispatch: a
        // window bubble listener runs after every element handler.
        await page.evaluate(() => {
            (window as unknown as { nativeMenuProbe: Array<{ shiftKey: boolean; prevented: boolean }> })
                .nativeMenuProbe = [];
            window.addEventListener("contextmenu", (event: Event) => {
                const e = event as MouseEvent;
                (window as unknown as { nativeMenuProbe: Array<{ shiftKey: boolean; prevented: boolean }> })
                    .nativeMenuProbe.push({ shiftKey: e.shiftKey, prevented: e.defaultPrevented });
            });
        });

        await firstItem.click({ button: "right", modifiers: ["Shift"] });
        await expect(page.locator(".context-menu")).toHaveCount(0);
        const nativeProbe = await page.evaluate(
            () => (window as unknown as { nativeMenuProbe: Array<{ shiftKey: boolean; prevented: boolean }> }).nativeMenuProbe,
        );
        expect(nativeProbe.length).toBeGreaterThan(0);
        expect(nativeProbe[nativeProbe.length - 1]).toEqual({ shiftKey: true, prevented: false });

        // Positive control: an unmodified right-click still opens the item menu...
        await firstItem.click({ button: "right" });
        const contextMenu = page.locator(".context-menu");
        await expect(contextMenu).toBeVisible();
        const ordinaryProbe = await page.evaluate(
            () => (window as unknown as { nativeMenuProbe: Array<{ shiftKey: boolean; prevented: boolean }> }).nativeMenuProbe,
        );
        expect(ordinaryProbe[ordinaryProbe.length - 1]).toEqual({ shiftKey: false, prevented: true });
        await page.keyboard.press("Escape");
        await expect(contextMenu).toHaveCount(0);

        // ...and keyboard activation still opens the application menu afterwards,
        // proving the escape holds no persistent bypass state.
        await firstItem.focus();
        await page.keyboard.press("Shift+F10");
        await expect(contextMenu).toBeVisible();
        await expect(contextMenu.locator("button").first()).toBeFocused();
    });
});
