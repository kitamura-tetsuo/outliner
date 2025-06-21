/** @feature CHT-001
 *  Title   : Chart Component
 *  Source  : docs/client-features.yaml
 */
import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

test.describe("CHT-001: Chart Component", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        await TestHelpers.prepareTestEnvironment(page, testInfo);
    });

    test("Chart component is visible", async ({ page }) => {
        await page.goto("/graph");
        const chart = page.locator("div.chart-container");
        await expect(chart).toBeVisible();
    });
});
