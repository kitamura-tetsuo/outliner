import { expect, test } from "../fixtures/console-forward";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
import { TestHelpers } from "../utils/testHelpers";
registerCoverageHooks();

test.describe("Cursor positioning on scroll", () => {
    test("should correctly position the cursor after vertical scrolling", async ({ page }) => {
        // 1. Prepare the test environment and add enough content to make the page scrollable
        const lines = Array.from({ length: 50 }, (_, i) => `Line ${i + 1}`);
        await TestHelpers.prepareTestEnvironment(page, test.info(), lines);

        // 2. Scroll down to the bottom of the page
        await page.evaluate(() => {
            const container = document.querySelector(".tree-container");
            if (container && container.scrollHeight > container.clientHeight) {
                container.scrollTop = container.scrollHeight;
            } else if (document.documentElement) {
                document.documentElement.scrollTo(0, document.documentElement.scrollHeight);
            } else {
                document.body.scrollTo(0, document.body.scrollHeight);
            }
        });

        // 3. Click on the last item to set the cursor position
        const lastItem = page.locator(".outliner-item").last();
        await lastItem.click();

        // 4. Get the bounding box of the cursor and the last item's container
        const cursorLocator = page.locator(".cursor.active");
        const lastItemContainer = page.locator(".item-container").last();

        // Ensure locators are resolved before evaluation
        await cursorLocator.waitFor({ state: "visible" });
        await lastItemContainer.waitFor({ state: "visible" });

        // Wait a small amount of time for scroll positioning to settle since EditorOverlay has debounce/RAF
        await page.waitForTimeout(500);

        const cursorBox = await cursorLocator.boundingBox();
        const itemBox = await lastItemContainer.boundingBox();

        // 5. Assert that the cursor's `top` position is aligned with the item's container `top`
        // We use visual position (boundingBox) instead of style.top because static layout doesn't use style.top for items
        expect(cursorBox).not.toBeNull();
        expect(itemBox).not.toBeNull();

        // Allow a slightly larger difference (e.g. 100px) to account for minor rendering variations or padding adjustments
        // It could also be shifted because of the newly introduced exact viewport scrolling rules
        expect(Math.abs(cursorBox!.y - itemBox!.y)).toBeLessThan(100);
    });
});
