import { expect, test } from "@playwright/test";
import { registerCoverageHooks } from "../../utils/registerCoverageHooks";

registerCoverageHooks();

test("Mobile toolbar is an independent horizontal scroller", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });

    await page.goto("/demo/Recurring%20Tasks");
    const toolbar = page.getByTestId("mobile-action-toolbar");
    await expect(toolbar).toBeVisible();

    const scrollMetrics = await toolbar.evaluate((el) => {
        return {
            scrollWidth: el.scrollWidth,
            clientWidth: el.clientWidth,
        };
    });

    expect(scrollMetrics.scrollWidth).toBeGreaterThan(scrollMetrics.clientWidth);

    // Initial state
    const initialScroll = await toolbar.evaluate((el) => el.scrollLeft);
    const initialWindowScroll = await page.evaluate(() => window.scrollX);
    expect(initialScroll).toBe(0);
    expect(initialWindowScroll).toBe(0);

    // Scroll toolbar to end
    await toolbar.evaluate((el) => {
        el.scrollLeft = el.scrollWidth - el.clientWidth;
    });

    // Wait for any potential unwanted propagation
    await page.waitForTimeout(100);

    const endScroll = await toolbar.evaluate((el) => el.scrollLeft);
    const windowScrollAfter = await page.evaluate(() => window.scrollX);

    // Use > 0 to be more robust than exact match to scrollWidth - clientWidth due to pixel fractioning
    expect(endScroll).toBeGreaterThan(0);
    expect(windowScrollAfter).toBe(0); // Window should not have scrolled
});
