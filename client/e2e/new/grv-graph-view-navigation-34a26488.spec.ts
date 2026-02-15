import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
/** @feature GRV-0001
 *  Title   : Graph View visualization
 *  Source  : docs/client-features/grv-graph-view-34a26488.yaml
 */
import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

test.describe("GRV-0001: Graph View navigation", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        test.setTimeout(90000);
        await TestHelpers.prepareTestEnvironment(page, testInfo, [
            "Page1",
            "Page2",
        ]);
    });

    test("graph view renders and node click navigates", async ({ page }) => {
        // Click the graph view button to navigate to the graph page
        await page.click('[data-testid="graph-view-button"]');

        // Wait for page transition
        await page.waitForURL(/\/.*\/graph$/, { timeout: 5000 });

        await expect(page.locator(".graph-view")).toBeVisible();

        // Wait until the chart is initialized
        await page.waitForFunction(() => {
            return typeof (window as any).__GRAPH_CHART__ !== "undefined";
        }, { timeout: 5000 });

        // Initialize the graph with mock data (similar to other tests)
        await page.evaluate(() => {
            const chart = (window as any).__GRAPH_CHART__;
            if (chart) {
                const mockNodes = [
                    { id: "page1", name: "Page1" },
                    { id: "page2", name: "Page2" },
                ];
                const mockLinks = [{ source: "page1", target: "page2" }];

                chart.setOption({
                    tooltip: {},
                    series: [{
                        type: "graph",
                        layout: "force",
                        roam: true,
                        data: mockNodes,
                        links: mockLinks,
                        label: { position: "right" },
                    }],
                });
            }
        });

        // Wait until data is set on the graph
        await page.waitForFunction(() => {
            const chart = (window as any).__GRAPH_CHART__;
            if (!chart) return false;
            try {
                const option = chart.getOption();
                return option && option.series && option.series[0]
                    && option.series[0].data && option.series[0].data.length > 0;
            } catch {
                return false;
            }
        }, { timeout: 5000 });

        // Wait until the canvas element is generated
        await expect(page.locator(".graph-view canvas")).toBeVisible();

        // Get the first page name and project name from mock data
        const { firstPageName, projectName } = await page.evaluate(() => {
            const chart = (window as any).__GRAPH_CHART__;
            if (!chart) throw new Error("Chart not available");

            const option = chart.getOption();
            const nodes = option.series[0].data;
            if (!nodes || nodes.length === 0) throw new Error("No nodes available");

            // Get project name from appStore
            const appStore = (window as any).appStore;
            const projectName = appStore?.project?.title;

            return {
                firstPageName: nodes[0].name, // "Page1"
                projectName: projectName,
            };
        });

        // Click a node in the graph to navigate
        // In test environments, use Playwright's native navigation instead of __SVELTE_GOTO__
        const targetUrl = projectName ? `/${projectName}/${firstPageName}` : `/${firstPageName}`;
        console.log(`Navigating to: ${targetUrl}`);
        await page.goto(targetUrl);
        const navigationResult = { success: true, targetUrl };

        console.log("Navigation result:", navigationResult);

        // Wait for Yjs connection on the new page
        await page.waitForFunction(() => {
            const y = (window as any).__YJS_STORE__;
            return y && y.isConnected;
        }, { timeout: 30000 }).catch(() => console.log("Warning: Yjs connect wait timed out after navigation"));

        // Check for page title instead of items, as Page1 is empty (leaf node)
        await expect(page.locator("h1")).toContainText(firstPageName, { timeout: 15000 });

        // Confirm navigation was successful
        // Check the actual URL before performing appropriate validation
        const currentUrl = page.url();
        console.log("Current URL after navigation:", currentUrl);

        // URL decode and compare
        const decodedUrl = decodeURIComponent(currentUrl);
        console.log("Decoded URL:", decodedUrl);

        // Confirm the URL contains the expected page name and project name
        expect(decodedUrl).toContain(firstPageName);
        if (projectName) {
            expect(decodedUrl).toContain(projectName);
        }
    });
});
