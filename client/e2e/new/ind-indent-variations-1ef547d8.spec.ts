import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
/** @feature IND-0001
 *  Title   : Tab and Shift+Tab indentation variations
 *  Source  : docs/client-features.yaml
 */
import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

test.describe("IND-0001: Indentation variations", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        await TestHelpers.prepareTestEnvironment(page, testInfo);

        const first = page.locator(".outliner-item").first();
        await first.locator(".item-content").click({ force: true });
        await page.waitForSelector("textarea.global-textarea:focus");

        for (let i = 1; i <= 3; i++) {
            if (i > 1) await page.keyboard.press("Enter");
            await page.keyboard.type(`Item ${i}`);
        }
    });

    test("indent item multiple times with Tab", async ({ page }) => {
        // Use the second item (Item 2) instead of the first item (Item 1)
        // Item 1 cannot be indented.
        const targetId = await page
            .locator("[data-item-id]")
            .nth(2)
            .getAttribute("data-item-id");
        const item = page.locator(`.outliner-item[data-item-id="${targetId}"]`);
        await item.locator(".item-content").click({ force: true });
        await expect(item).toBeVisible();

        let previous = (await item.boundingBox())!.x;
        for (let i = 0; i < 2; i++) {
            await page.keyboard.press("Tab");
            const current = (await item.boundingBox())!.x;
            expect(current).toBeGreaterThanOrEqual(previous);
            previous = current;
        }
    });

    test("indent and outdent multiple selected items", async ({ page }) => {
        // Select Item 2 and Item 3 (indices 2 and 3)
        // Indices: 0=Title, 1=Item1, 2=Item2, 3=Item3
        const ids = await page.$$eval(
            "[data-item-id]",
            els => els.slice(0, 4).map(el => el.getAttribute("data-item-id")!),
        );
        const [, , secondId, thirdId] = ids; // secondId=Item2, thirdId=Item3

        await page.evaluate(({ startId, endId }) => {
            const store: any = (window as any).editorOverlayStore;
            store.setSelection({
                startItemId: startId,
                startOffset: 0,
                endItemId: endId,
                endOffset: 0,
                userId: "local",
                isReversed: false,
            });
        }, { startId: secondId, endId: thirdId });

        const item2 = page.locator(`.outliner-item[data-item-id="${secondId}"]`);
        const item3 = page.locator(`.outliner-item[data-item-id="${thirdId}"]`);
        await expect(item2).toBeVisible();
        await expect(item3).toBeVisible();

        const beforeX2 = (await item2.boundingBox())!.x;
        const beforeX3 = (await item3.boundingBox())!.x;

        await page.keyboard.press("Tab");
        await page.waitForTimeout(100);

        const afterX2 = (await item2.boundingBox())!.x;
        const afterX3 = (await item3.boundingBox())!.x;

        expect(afterX2).toBeGreaterThan(beforeX2);
        expect(afterX3).toBeGreaterThan(beforeX3);

        await page.keyboard.press("Shift+Tab");
        await page.waitForTimeout(100);

        const finalX2 = (await item2.boundingBox())!.x;
        const finalX3 = (await item3.boundingBox())!.x;

        expect(finalX2).toBeLessThan(afterX2);
        expect(finalX3).toBeLessThan(afterX3);
    });
});
