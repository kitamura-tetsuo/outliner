import { expect, test } from "@playwright/test";

test.describe("Chart Component E2E", () => {
    test("should display chart component option in dropdown", async ({ page }) => {
        // Navigate to the main page
        await page.goto("http://localhost:7090/");
        await page.waitForLoadState("domcontentloaded");

        // Wait for the page to load and find an item
        await page.waitForSelector(".outliner-item", { timeout: 10000 });

        // Find the first item's component selector
        const componentSelector = await page.locator(".component-selector select").first();
        await expect(componentSelector).toBeVisible();

        // Check that "chart" option exists
        const options = await componentSelector.locator("option").allTextContents();
        expect(options).toContain("チャート");
    });

    test("should show chart editor and panel when chart component is selected", async ({ page }) => {
        // Navigate to the main page
        await page.goto("http://localhost:7090/");
        await page.waitForLoadState("domcontentloaded");

        // Wait for the page to load and find an item
        await page.waitForSelector(".outliner-item", { timeout: 10000 });

        // Find the first item's component selector and select "chart"
        const componentSelector = await page.locator(".component-selector select").first();
        await componentSelector.selectOption("chart");

        // Wait a bit for the component to render
        await page.waitForTimeout(1000);

        // Check that the chart query editor is visible
        const chartQueryEditor = await page.locator(".chart-query-editor");
        await expect(chartQueryEditor).toBeVisible();

        // Check that the chart panel is visible
        const chartPanel = await page.locator(".chart-panel");
        await expect(chartPanel).toBeVisible();
    });
});
