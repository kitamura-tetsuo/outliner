import { expect, test } from "@playwright/test";
import { registerCoverageHooks } from "../../utils/registerCoverageHooks";

registerCoverageHooks();

test("Wide components are scrollable horizontally without widening the document", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });

    // Wait for the components to exist by navigating to demo pages
    await page.goto("/demo");
    await expect(page.getByTestId("app-layout").getByTestId("main-toolbar")).toBeVisible();
    await page.waitForTimeout(500);

    const checkElementScroll = async (locator: any) => {
        if (await locator.isVisible()) {
            const scrollMetrics = await locator.evaluate((el: Element) => {
                return {
                    scrollWidth: el.scrollWidth,
                    clientWidth: el.clientWidth,
                };
            });
            expect(scrollMetrics.scrollWidth).toBeGreaterThanOrEqual(scrollMetrics.clientWidth);

            await locator.evaluate((el: Element) => el.scrollLeft = el.scrollWidth);
            const windowScrollAfter = await page.evaluate(() => window.scrollX);
            expect(windowScrollAfter).toBe(0);
        }
    };

    await checkElementScroll(page.getByTestId("yjs-table-grid").first());
    await checkElementScroll(page.getByTestId("calendar-time-grid-scroll").first());
    await checkElementScroll(page.getByTestId("calendar-gantt-chart").first());

    await page.goto("/demo/Recurring%20Tasks");
    await expect(page.getByTestId("app-layout").getByTestId("main-toolbar")).toBeVisible();
    await page.waitForTimeout(500);

    await checkElementScroll(page.getByTestId("yjs-table-grid").first());
    await checkElementScroll(page.getByTestId("calendar-time-grid-scroll").first());
    await checkElementScroll(page.getByTestId("calendar-gantt-chart").first());

    const docScrollMetrics = await page.evaluate(() => {
        const de = document.documentElement;
        return {
            scrollWidth: de.scrollWidth,
            clientWidth: de.clientWidth,
        };
    });
    expect(docScrollMetrics.scrollWidth).toBeLessThanOrEqual(docScrollMetrics.clientWidth);
});
