/** @feature SRE-001
 *  Title   : Advanced Search & Replace
 *  Source  : docs/client-features.yaml
 */
import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

test.describe("SRE-001: Advanced Search & Replace", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        await TestHelpers.prepareTestEnvironment(page, testInfo);
    });

    test("search panel should be visible", async ({ page }) => {
        const openButton = page.locator(".search-btn");
        if (await openButton.count()) {
            await openButton.click();
        }
        await expect(page.locator(".search-panel")).toBeVisible();
    });
});
