/** @feature GRF-001 */
import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

test.describe("GRF-001: Graph navigation", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        await TestHelpers.prepareTestEnvironment(page, testInfo);
        await page.goto("/graph");
    });

    test("clicking a graph node navigates to the page", async ({ page }) => {
        await expect(page.locator("svg#graph-svg circle").first()).toBeVisible();
        const firstNode = page.locator("svg#graph-svg circle").first();
        const href = await firstNode.evaluate((el) => {
            const title = (el as any).__data__.title;
            return title;
        });
        await firstNode.click();
        await expect(page.locator(".outliner-base")).toBeVisible();
        await expect(page).toHaveURL(/\/[\w-]+\/.+/);
    });
});
