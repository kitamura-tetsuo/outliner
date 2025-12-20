import { expect, test } from "../fixtures/console-forward.ts";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
import { TestHelpers } from "../utils/testHelpers.ts";
registerCoverageHooks();

test.describe("Cursor positioning on scroll", () => {
    test("should correctly position the cursor after vertical scrolling", async ({ page }) => {
        // 1. Prepare the test environment and add enough content to make the page scrollable
        const lines = Array.from({ length: 50 }, (_, i) => `Line ${i + 1}`);
        await TestHelpers.prepareTestEnvironment(page, test.info(), lines);

        // 2. Scroll down to the bottom of the page
        await page.evaluate(() => {
            const container = document.querySelector(".tree-container");
            if (container) {
                container.scrollTop = container.scrollHeight;
            }
        });

        // 3. Click on the last item to set the cursor position
        const lastItem = page.locator(".outliner-item").last();
        await lastItem.click();

        // 4. Get the `top` style of the cursor and the last item's container
        const cursorLocator = page.locator(".cursor.active");
        const lastItemContainer = page.locator(".item-container").last();

        // Ensure locators are resolved before evaluation
        await cursorLocator.waitFor({ state: "visible" });
        await lastItemContainer.waitFor({ state: "visible" });

        const cursorTop = await cursorLocator.evaluate(el => parseFloat(getComputedStyle(el).top));
        const itemContainerTop = await lastItemContainer.evaluate(el => parseFloat(getComputedStyle(el).top));

        // 5. Assert that the cursor's `top` position is aligned with the item's container `top`
        expect(cursorTop).toBeCloseTo(itemContainerTop, 5);
    });
});
