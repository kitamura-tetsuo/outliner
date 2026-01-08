import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
/** @feature CHART-COMP
 *  Title   : Chart Component
 *  Source  : docs/client-features.yaml
 */
import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

test.describe("Chart Component E2E", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        test.setTimeout(90000);
        await TestHelpers.prepareTestEnvironment(page, testInfo, [
            "first line",
            "second line",
        ]);
    });

    test("should display chart component option in dropdown", async ({ page }) => {
        const projectName = page.url().split("/")[3];
        const pageName = page.url().split("/")[4];
        await page.goto(`/${projectName}/${pageName}`);

        // Wait for the page to load and find an item
        await page.waitForSelector(".outliner-item", { timeout: 20000 });

        // Find the first non-title item's component selector (skip index 0 which is the page title)
        const componentSelector = await page.locator(".component-selector select").nth(1);
        await expect(componentSelector).toBeVisible();

        // Check if "チャート" option is available (Japanese text)
        const options = await componentSelector.locator("option").allTextContents();
        expect(options).toContain("チャート");
    });

    test.fixme("should show chart editor and panel when chart component is selected", async ({ page }) => {
        const projectName = page.url().split("/")[3];
        const pageName = page.url().split("/")[4];
        await page.goto(`/${projectName}/${pageName}`);

        // Wait for the page to load and find an item
        await page.waitForSelector(".outliner-item", { timeout: 20000 });

        // Find a non-title item's component selector and select chart
        const componentSelector = await page.locator(".component-selector select").first();
        await componentSelector.selectOption("chart");
        await expect(componentSelector).toHaveValue("chart");

        // Wait for chart editor to appear (ChartQueryEditor component)
        await expect(page.locator(".chart-query-editor")).toBeVisible({ timeout: 15000 });
    });
});
