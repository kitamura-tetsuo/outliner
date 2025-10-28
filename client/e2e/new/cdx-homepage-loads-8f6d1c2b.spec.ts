import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
/** @feature CDX-8f6d1c2b
 *  Title   : Home page loads after setup
 *  Source  : docs/client-features/cdx-homepage-loads-8f6d1c2b.yaml
 */
import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

test("home page is reachable", async ({ page }, testInfo) => {
    await TestHelpers.prepareTestEnvironmentForProject(page, testInfo);
    await expect(page.getByRole("heading", { name: "Outliner" })).toBeVisible();
});
