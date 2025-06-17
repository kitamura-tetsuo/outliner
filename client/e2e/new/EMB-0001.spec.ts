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
});
