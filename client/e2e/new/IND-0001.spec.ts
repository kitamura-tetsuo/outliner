/** @feature IND-0001
 *  Title   : Advanced indentation and selection operations
 *  Source  : docs/client-features.yaml
 */
import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

test.describe("IND-0001: Advanced indentation and selection", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        await TestHelpers.prepareTestEnvironment(page, testInfo);

        const first = page.locator(".outliner-item").first();
        await first.locator(".item-content").click({ force: true });
        await page.waitForSelector("textarea.global-textarea:focus");

        for (let i = 1; i <= 4; i++) {
            if (i > 1) {
                await page.keyboard.press("Enter");
            }
            await page.keyboard.type(`Item ${i}`);
        }
    });

    test("indent and unindent items", async ({ page }) => {
        const item2 = page.locator(".outliner-item").nth(1);
        await item2.locator(".item-content").click({ force: true });
        await page.keyboard.press("Tab");
        const depth2 = await item2.evaluate(el => parseInt(getComputedStyle(el as HTMLElement).getPropertyValue("--item-depth")));
        expect(depth2).toBe(1);

        const item3 = page.locator(".outliner-item").nth(2);
        await item3.locator(".item-content").click({ force: true });
        await page.keyboard.press("Tab");
        await page.keyboard.press("Tab");
        const depth3 = await item3.evaluate(el => parseInt(getComputedStyle(el as HTMLElement).getPropertyValue("--item-depth")));
        expect(depth3).toBe(2);

        await page.keyboard.press("Shift+Tab");
        const depth3After = await item3.evaluate(el => parseInt(getComputedStyle(el as HTMLElement).getPropertyValue("--item-depth")));
        expect(depth3After).toBe(1);
    });

    test("copy and paste nested selection", async ({ page }) => {
        const items = page.locator(".outliner-item");
        const item2 = items.nth(1);
        await item2.locator(".item-content").click({ force: true });
        await page.keyboard.press("Tab");
        await page.keyboard.press("ArrowDown");
        await page.keyboard.press("Tab");

        await page.evaluate(() => {
            const store: any = (window as any).editorOverlayStore;
            const items = document.querySelectorAll("[data-item-id]");
            if (items.length < 3 || !store) return;
            const startId = items[1].getAttribute("data-item-id")!;
            const endId = items[2].getAttribute("data-item-id")!;
            store.setSelection({ startItemId: startId, startOffset: 0, endItemId: endId, endOffset: 0, userId: "local", isReversed: false });
        });

        await page.keyboard.press("Control+c");
        await page.keyboard.press("End");
        await page.keyboard.press("Enter");
        await page.keyboard.press("Control+v");
        await page.waitForTimeout(500);
        await expect(items).toHaveCount(5);
    });
});
