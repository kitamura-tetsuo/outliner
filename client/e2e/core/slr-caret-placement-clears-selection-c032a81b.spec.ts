import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

test.describe("SLR: Caret placement clears selection", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        await TestHelpers.seedProjectAndNavigate(page, testInfo);

        // Select the first item
        const item = page.locator(".outliner-item").first();
        await item.locator(".item-content").click({ force: true });
        await page.waitForSelector("textarea.global-textarea:focus");
        await TestHelpers.waitForCursorVisible(page);

        // Enter test text
        await page.keyboard.type("First item text");
        await page.keyboard.press("Enter");
        await page.keyboard.type("Second item text");
        await page.keyboard.press("Enter");
        await page.keyboard.type("Third item text");
    });

    test("Clicking another item clears local selection", async ({ page }) => {
        const firstItem = await TestHelpers.getItemIdByIndex(page, 0);

        await page.locator(`[data-item-id="${firstItem}"] .item-text`).click();
        await page.keyboard.down("Shift");
        await page.keyboard.press("ArrowDown");
        await page.keyboard.press("ArrowRight");
        await page.keyboard.press("ArrowRight");
        await page.keyboard.up("Shift");

        let selectionState = await page.evaluate(() => {
            // eslint-disable-next-line no-restricted-globals
            const store = (window as any).editorOverlayStore;
            const selections = Object.values(store.selections);
            return { count: selections.length, hasLocal: selections.some((s: any) => s.userId === "local") };
        });
        expect(selectionState.hasLocal).toBe(true);

        const thirdItem = await TestHelpers.getItemIdByIndex(page, 2);
        await page.locator(`[data-item-id="${thirdItem}"] .item-text`).click();

        selectionState = await page.evaluate(() => {
            // eslint-disable-next-line no-restricted-globals
            const store = (window as any).editorOverlayStore;
            const selections = Object.values(store.selections);
            return { count: selections.length, hasLocal: selections.some((s: any) => s.userId === "local") };
        });
        expect(selectionState.hasLocal).toBe(false);

        const cursorState = await page.evaluate(() => {
            // eslint-disable-next-line no-restricted-globals
            const store = (window as any).editorOverlayStore;
            return Object.values(store.cursors).filter((c: any) => c.userId === "local").map((c: any) => c.itemId);
        });
        expect(cursorState).toContain(thirdItem);
    });
});
