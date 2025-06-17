/** @feature CHT-001 */
import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

test.describe("CHT-001: Chart Component", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        await TestHelpers.prepareTestEnvironment(page, testInfo, [], true, true);
        await page.goto("/graph", { waitUntil: "domcontentloaded" });
    });

    test("chart renders page item counts", async ({ page }) => {
        const pageCount = await TestHelpers.getPageCount(page);
        await expect(page.locator("svg#chart-svg rect")).toHaveCount(pageCount);
    });

    test("chart updates when data changes", async ({ page }) => {
        const newPageName = `p-${Date.now()}`;
        await TestHelpers.createTestPageViaAPI(page, newPageName, []);
        await page.goto("/graph", { waitUntil: "domcontentloaded" });
        const pageCount = await TestHelpers.getPageCount(page);
        await expect(page.locator("svg#chart-svg rect")).toHaveCount(pageCount);
    });
});
