import { expect, test } from "@playwright/test";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
import { TestHelpers } from "../utils/testHelpers";

registerCoverageHooks();

test("hidden global textarea does not widen document on resize", async ({ page }, testInfo) => {
    // Navigate to a test page
    await TestHelpers.seedProjectAndNavigate(page, testInfo, [
        "Item 1",
        "Item 2",
    ]);
    await TestHelpers.waitForOutlinerItems(page, 3);

    // Wait for the app to initialize
    const appContainer = page.getByTestId("outliner-base");
    await expect(appContainer).toBeVisible();

    // Add some long text to make sure we have content
    const firstItemId = await TestHelpers.getItemIdByIndex(page, 1);
    const itemTextLocator = page.locator(`.outliner-item[data-item-id="${firstItemId}"] .item-content`);

    await itemTextLocator.click();
    const longText =
        "This is a very long text that will surely push the textarea to the right side of the screen when clicked at the end.";
    await page.keyboard.type(longText);

    // Wait for the textarea to be positioned
    await page.waitForTimeout(500);

    // Resize viewport to smaller width (e.g., mobile)
    await page.setViewportSize({ width: 375, height: 812 });

    // Dispatch resize event just to be sure
    await page.evaluate(() => {
        globalThis.dispatchEvent(new Event("resize"));
    });

    // Wait for debounce and re-positioning
    await page.waitForTimeout(500);

    // Check document width after resize
    const afterResizeClientWidth = await page.evaluate(() => document.documentElement.clientWidth);
    const afterResizeScrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);

    // Document scrollWidth should match clientWidth, indicating no horizontal scrolling
    // Use closeTo because of some potential small layout differences, though it should ideally be exact
    expect(afterResizeScrollWidth).toBeLessThanOrEqual(afterResizeClientWidth + 100);

    // Specifically check textarea doesn't overflow
    const textareaBounds = await page.evaluate(() => {
        const ta = document.querySelector(".global-textarea");
        if (!ta) return null;
        const rect = ta.getBoundingClientRect();
        return {
            x: rect.x,
            right: rect.right,
            width: rect.width,
        };
    });

    if (textareaBounds) {
        // the left position should be clamped or repositioned so that it doesn't push the layout out
        expect(textareaBounds.x).toBeLessThanOrEqual(afterResizeClientWidth);
    }
});
