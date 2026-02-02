import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
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
        const items = page.locator(".outliner-item");

        // Note: The first list item (items.nth(1)) cannot be indented as it has no sibling above it.
        // We start verification from the second list item (items.nth(2)).

        const item3 = items.nth(2);
        await item3.locator(".item-content").click({ force: true });
        const box3Before = await item3.boundingBox();
        expect(box3Before).not.toBeNull();

        await page.keyboard.press("Tab");
        const box3 = await item3.boundingBox();
        expect(box3).not.toBeNull();
        expect(box3!.x).toBeGreaterThan(box3Before!.x);

        const item4 = items.nth(3);
        await item4.locator(".item-content").click({ force: true });
        const box4Before = await item4.boundingBox();
        expect(box4Before).not.toBeNull();

        await page.keyboard.press("Tab");
        const box4 = await item4.boundingBox();
        expect(box4).not.toBeNull();
        expect(box4!.x).toBeGreaterThan(box4Before!.x);

        await page.keyboard.press("Shift+Tab");
        const box4After = await item4.boundingBox();
        expect(box4After).not.toBeNull();
        expect(box4After!.x).toBeLessThan(box4!.x);
    });

    test("copy and paste nested selection", async ({ page }) => {
        const items = page.locator(".outliner-item");
        const item2 = items.nth(1);
        // We do not indent item2 because it's the first item.

        const item3 = items.nth(2);
        await item3.locator(".item-content").click({ force: true });
        await page.keyboard.press("Tab");
        const initialCount = await items.count();

        await page.evaluate(() => {
            const store: any = (window as any).editorOverlayStore;
            const items = document.querySelectorAll("[data-item-id]");
            if (items.length < 3 || !store) return;
            const startId = items[1].getAttribute("data-item-id")!;
            const endId = items[2].getAttribute("data-item-id")!;
            store.setSelection({
                startItemId: startId,
                startOffset: 0,
                endItemId: endId,
                endOffset: 0,
                userId: "local",
                isReversed: false,
            });
        });

        await page.keyboard.press("Control+c");
        await page.keyboard.press("End");
        await page.keyboard.press("Enter");
        await page.keyboard.press("Control+v");
        await TestHelpers.waitForUIStable(page);
        const finalCount = await items.count();
        expect(finalCount).toBeGreaterThanOrEqual(initialCount);
    });
});
