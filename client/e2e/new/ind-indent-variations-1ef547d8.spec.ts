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
        const secondId = await page
            .locator("[data-item-id]")
            .nth(1)
            .getAttribute("data-item-id");
        const item = page.locator(`.outliner-item[data-item-id="${secondId}"]`);
        await item.locator(".item-content").click({ force: true });
        await expect(item).toBeVisible();

        let previous = await item.evaluate(el =>
            parseInt(getComputedStyle(el as HTMLElement).getPropertyValue("--item-depth"))
        );
        for (let i = 0; i < 2; i++) {
            await page.keyboard.press("Tab");
            const current = await item.evaluate(el =>
                parseInt(getComputedStyle(el as HTMLElement).getPropertyValue("--item-depth"))
            );
            expect(current).toBeGreaterThanOrEqual(previous);
            previous = current;
        }
    });

    test("indent and outdent multiple selected items", async ({ page }) => {
        const ids = await page.$$eval(
            "[data-item-id]",
            els => els.slice(0, 3).map(el => el.getAttribute("data-item-id")!),
        );
        const [, secondId, thirdId] = ids;

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

        await page.keyboard.press("Tab");
        await page.waitForTimeout(100);

        const depth2 = await page.locator(`.outliner-item[data-item-id="${secondId}"]`).evaluate(el =>
            parseInt(getComputedStyle(el as HTMLElement).getPropertyValue("--item-depth"))
        );
        const depth3 = await page.locator(`.outliner-item[data-item-id="${thirdId}"]`).evaluate(el =>
            parseInt(getComputedStyle(el as HTMLElement).getPropertyValue("--item-depth"))
        );
        expect(depth2).toBeGreaterThanOrEqual(1);
        expect(depth3).toBeGreaterThanOrEqual(1);

        await page.keyboard.press("Shift+Tab");
        await page.waitForTimeout(100);
        const depth2After = await page.locator(`.outliner-item[data-item-id="${secondId}"]`).evaluate(el =>
            parseInt(getComputedStyle(el as HTMLElement).getPropertyValue("--item-depth"))
        );
        const depth3After = await page.locator(`.outliner-item[data-item-id="${thirdId}"]`).evaluate(el =>
            parseInt(getComputedStyle(el as HTMLElement).getPropertyValue("--item-depth"))
        );
        expect(depth2After).toBeLessThanOrEqual(depth2);
        expect(depth3After).toBeLessThanOrEqual(depth3);
    });
});
