/** @feature GRF-001
 *  Title   : Graph View
 *  Source  : docs/client-features.yaml
 */
import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

test.describe("GRF-001: Graph View navigation", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        await TestHelpers.prepareTestEnvironment(page, testInfo);
    });

    test("graph view renders and node click navigates", async ({ page }) => {
        await page.goto("/graph");
        await expect(page.locator(".graph-view")).toBeVisible();
        await expect(page.locator(".graph-view canvas")).toBeVisible();

        const firstPageName = await page.evaluate(() => (window as any).__FLUID_STORE__.pages.current[0].text);
        await page.evaluate((name) => {
            const chart: any = (window as any).__GRAPH_CHART__;
            const series = chart.getOption().series[0];
            const index = series.data.findIndex((d: any) => d.name === name);
            chart.dispatchAction({ type: 'click', seriesIndex: 0, dataIndex: index });
        }, firstPageName);
        await expect(page).toHaveURL(new RegExp(`/${firstPageName}$`));
    });
});
