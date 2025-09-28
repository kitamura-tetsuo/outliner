/** @feature CDX-8f6d1c2b
 *  Title   : Home page loads after setup
 *  Source  : docs/client-features/cdx-homepage-loads-8f6d1c2b.yaml
 */
import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

test("home page is reachable", async ({ page }, testInfo) => {
    await TestHelpers.prepareTestEnvironmentForProject(page, testInfo, [], undefined);
    await expect(page.locator("text=Outliner")).toBeVisible();
});
import "../utils/registerAfterEachSnapshot";
