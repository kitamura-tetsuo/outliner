/** @feature GVI-0001 */
import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

test.describe("GVI-0001: Graph View", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        await TestHelpers.prepareTestEnvironment(page, testInfo);
        await page.goto("/graph");
    });

    test("renders graph nodes and links", async ({ page }) => {
        await expect(page.locator("svg#graph-svg circle").first()).toBeVisible();
        await expect(page.locator("svg#graph-svg line").first()).toBeVisible();
    });
});

