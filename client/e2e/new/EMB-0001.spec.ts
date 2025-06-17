/** @feature EMB-0001
 * Outliner Table & Chart Embedding
 */
import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

test.describe("EMB-0001: Table embed in outliner", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        await TestHelpers.prepareTestEnvironment(page, testInfo);
        // add table item via Fluid API
        await page.evaluate(() => {
            const fluidClient = (window as any).__FLUID_STORE__?.fluidClient;
            if (!fluidClient) throw new Error("FluidClient not available");
            const project = fluidClient.getProject();
            const pageItem = project.items[0];
            const newItem = pageItem.items.addNode("test-user");
            newItem.embed = { type: 'table', query: 'SELECT id as tbl_pk, value, num FROM tbl' };
        });
    });

    test("table embed renders", async ({ page }) => {
        await expect(page.locator('[data-testid="editable-grid"]')).toBeVisible();
        await expect(page.locator('[data-testid="chart-panel"]')).toBeVisible();
    });

    test('editable grid has expected data', async ({ page }) => {
        await page.waitForSelector('[data-testid="editable-grid"] .wx-grid', { timeout: 10000 });
        await page.waitForTimeout(2000);

        const info = await TestHelpers.getEditableGridCellInfo(page);
        expect(info).toBeDefined();
        expect(info?.cellCount).toBe(9);
        expect(info?.dataCellCount).toBe(6);
        expect(info?.firstDataCellText).toBe('1');
    });

    test('chart option exposes series data', async ({ page }) => {
        await page.waitForFunction(() => {
            return (window as any).__JOIN_TABLE__ && (window as any).__JOIN_TABLE__.chartOption;
        }, { timeout: 5000 });

        const option = await TestHelpers.getJoinTableChartOption(page);
        expect(option).toBeDefined();
        expect(option.series?.[0]?.type).toBe('bar');
        expect(option.series?.[0]?.data).toEqual([1, 2]);
        expect(option.xAxis?.data).toEqual(['a', 'b']);
    });
});
