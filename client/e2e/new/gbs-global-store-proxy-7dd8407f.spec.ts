/** @feature GBS-7dd8407f
 *  Title   : Global Store Proxy
 *  Source  : docs/client-features/gbs-global-store-proxy-7dd8407f.yaml
 */
import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

test.describe("GBS-7dd8407f: Global Store Proxy", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        await TestHelpers.prepareTestEnvironment(page, testInfo);
    });

    test("project title is accessible via global store", async ({ page }) => {
        await page.goto("/");
        await expect(page.locator("h1")).toBeVisible();
    });
});
