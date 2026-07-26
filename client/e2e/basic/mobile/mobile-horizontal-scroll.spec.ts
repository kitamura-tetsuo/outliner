import { expect, test } from "@playwright/test";
import { registerCoverageHooks } from "../../utils/registerCoverageHooks";

registerCoverageHooks();

test("Page should not scroll horizontally on mobile viewport", async ({ page }) => {
    // Set viewport to 375x812 (iPhone size)
    await page.setViewportSize({ width: 375, height: 812 });

    // The issue is related to a demo page, let's navigate there
    await page.goto("/demo/Recurring%20Tasks");
    // Wait for the toolbar to be visible
    await expect(page.getByTestId("app-layout").getByTestId("main-toolbar")).toBeVisible();

    // Also wait for the search input to be present to ensure page fully loads components
    await expect(page.getByTestId("app-layout").getByTestId("search-pages-input")).toBeVisible();

    // Give it a moment to render completely
    await page.waitForTimeout(500);

    // Check if scrollWidth > clientWidth
    const hasHorizontalScroll = await page.evaluate(() => {
        const de = document.documentElement;
        return {
            scrollWidth: de.scrollWidth,
            clientWidth: de.clientWidth,
        };
    });

    console.log("Scroll metrics:", hasHorizontalScroll);

    expect(hasHorizontalScroll.scrollWidth).toBeLessThanOrEqual(hasHorizontalScroll.clientWidth);
});
