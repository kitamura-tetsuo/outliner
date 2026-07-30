import { test, expect } from '../fixtures/auth';
import { e2ePageLocator } from '../utils/locator';
import { getFirstItemId, getTestPageId } from '../utils/pageUtils';

test('hidden global textarea does not widen document on resize', async ({ page }) => {
    // Navigate to a test page
    const pageId = await getTestPageId();
    await page.goto(`/${pageId}`);

    // Wait for the app to initialize
    const appContainer = page.locator('.app-container');
    await expect(appContainer).toBeVisible();

    // Add some long text to make sure we have content
    const firstItemId = await getFirstItemId(page);
    const itemRowLocator = e2ePageLocator(page).getLocatorForItem(firstItemId);
    const itemTextLocator = e2ePageLocator(page).getLocatorForItemText(firstItemId);

    await itemTextLocator.click();
    const longText = 'This is a very long text that will surely push the textarea to the right side of the screen when clicked at the end.';
    await page.keyboard.type(longText);

    // Wait for the textarea to be positioned
    await page.waitForTimeout(500);

    // Check initial document width at desktop size
    const initialDocWidth = await page.evaluate(() => document.documentElement.scrollWidth);

    // Resize viewport to smaller width (e.g., mobile)
    await page.setViewportSize({ width: 375, height: 812 });

    // Dispatch resize event just to be sure
    await page.evaluate(() => {
        window.dispatchEvent(new Event('resize'));
    });

    // Wait for debounce and re-positioning
    await page.waitForTimeout(500);

    // Check document width after resize
    const afterResizeClientWidth = await page.evaluate(() => document.documentElement.clientWidth);
    const afterResizeScrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);

    // Document scrollWidth should match clientWidth, indicating no horizontal scrolling
    expect(afterResizeScrollWidth).toBeLessThanOrEqual(afterResizeClientWidth + 1); // Allow 1px diff

    // Specifically check textarea doesn't overflow
    const textareaBounds = await page.evaluate(() => {
        const ta = document.querySelector('.global-textarea');
        if (!ta) return null;
        const rect = ta.getBoundingClientRect();
        return {
            x: rect.x,
            right: rect.right,
            width: rect.width
        };
    });

    if (textareaBounds) {
        expect(textareaBounds.right).toBeLessThanOrEqual(afterResizeClientWidth);
    }
});
