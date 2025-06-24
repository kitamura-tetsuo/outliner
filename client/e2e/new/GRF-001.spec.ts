/** @feature GRF-001
 *  Title   : Graph View
 *  Source  : docs/client-features.yaml
 */
import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

test.describe("GRF-001: Graph View", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        await TestHelpers.prepareTestEnvironment(page, testInfo);
    });

    test("graph page is accessible", async ({ page }) => {
        await page.goto("/graph");
        await page.waitForLoadState("domcontentloaded");
        await expect(page.locator("body")).toBeVisible();

        const hasGraph = await page.evaluate(() => {
            return document.querySelector("#graph, .graph-container, svg") !== null;
        });
        expect(hasGraph).toBe(true);
    });
});
