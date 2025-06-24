/** @feature GVI-0001
 *  Title   : Graph View
 *  Source  : docs/client-features.yaml
 */
import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

test.describe("GVI-0001: Graph View navigation", () => {
    let projectName: string;
    let pageName: string;

    test.beforeEach(async ({ page }, testInfo) => {
        const result = await TestHelpers.prepareTestEnvironment(page, testInfo, [
            "link to [LinkedPage]"
        ]);
        projectName = result.projectName;
        pageName = result.pageName;
        await TestHelpers.createTestPageViaAPI(page, "LinkedPage", ["test"]);
    });

    test("Clicking graph node navigates to page", async ({ page }) => {
        await page.goto("/graph");
        await page.waitForFunction(() => (window as any).graphChart);
        // ensure nodes exist
        const nodes = await page.evaluate(() => (window as any).graphChart.getOption().series[0].data);
        expect(nodes.length).toBeGreaterThanOrEqual(2);
        // click node representing LinkedPage
        await page.evaluate(() => {
            const chart = (window as any).graphChart;
            const nodeIndex = chart.getOption().series[0].data.findIndex((n: any) => n.name === "LinkedPage");
            chart.dispatchAction({ type: 'click', seriesIndex: 0, dataIndex: nodeIndex });
        });
        await expect(page).toHaveURL(`/${projectName}/LinkedPage`);
    });
});
