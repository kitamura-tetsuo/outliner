/** @feature GRV-0001
 *  Title   : Graph View visualization
 *  Source  : docs/client-features.yaml
 */
import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

test.describe("GRV-0001: Graph View real-time updates", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        await TestHelpers.prepareTestEnvironment(page, testInfo);
    });

    test("graph updates when new page is added", async ({ page }) => {
        await page.goto("/graph");
        await expect(page.locator(".graph-view")).toBeVisible();
        await expect(page.locator(".graph-view canvas")).toBeVisible();

        // Wait until initial graph is ready with one node
        await page.waitForFunction(() => {
            const chart = (window as any).__GRAPH_CHART__;
            return chart && chart.getOption().series[0].data.length === 1;
        });

        // Create a new page that matches the default link [test-link]
        await TestHelpers.createTestPageViaAPI(page, "test-link", ["second page"]);

        // Wait for the graph to update with the new node and link
        await page.waitForFunction(() => {
            const chart = (window as any).__GRAPH_CHART__;
            if (!chart) return false;
            const option = chart.getOption();
            return option.series[0].data.length >= 2 && option.series[0].links.length >= 1;
        }, { timeout: 10000 });

        const data = await page.evaluate(() => {
            const chart = (window as any).__GRAPH_CHART__;
            const opt = chart.getOption();
            return {
                nodes: opt.series[0].data.length,
                links: opt.series[0].links.length
            };
        });

        expect(data.nodes).toBeGreaterThanOrEqual(2);
        expect(data.links).toBeGreaterThanOrEqual(1);
    });
});
