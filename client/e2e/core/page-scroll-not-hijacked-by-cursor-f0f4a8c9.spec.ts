// @feature core-page-scroll-not-hijacked-by-cursor-f0f4a8c9
import { expect, test } from "@playwright/test";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
import { TestHelpers } from "../utils/testHelpers";
registerCoverageHooks();

test.describe("Desktop - User scroll is never overridden by caret auto-scroll", () => {
    test("scrolling a page leaves the scroll position where the user put it", async ({ page }, testInfo) => {
        // Generate a long list of items so we can scroll
        const lines = Array.from({ length: 50 }, (_, i) => `Item ${i}`);
        await TestHelpers.seedProjectAndNavigate(page, testInfo, lines);

        // Place caret in the first item
        await page.click("[data-item-id]:first-child .item-text");
        await page.waitForTimeout(500);

        const initialScrollY = await page.evaluate(() => globalThis.scrollY);
        expect(initialScrollY).toBe(0);

        // Simulate user scroll
        await page.evaluate(() => {
            globalThis.scrollTo(0, 200);
            globalThis.dispatchEvent(new Event("scroll"));
        });

        // Wait past the debounce window (100ms + some buffer)
        await page.waitForTimeout(500);

        const finalScrollY = await page.evaluate(() => globalThis.scrollY);

        // Assert scroll position hasn't reverted back to 0
        expect(finalScrollY).toBe(200);
    });
});
