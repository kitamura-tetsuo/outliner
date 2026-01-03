import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
/** @feature APP-8f6d1c2b
 *  Title   : Home page loads after setup
 *  Source  : docs/client-features/homepage-loads-8f6d1c2b.yaml
 */
import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

test("project page is reachable", async ({ page }, testInfo) => {
    const { projectName, pageName } = await TestHelpers.prepareTestEnvironmentForProject(page, testInfo, [], undefined);
    // On a project page, the heading shows the project and page title
    await expect(page.getByRole("heading", { name: `${projectName} / ${pageName}` })).toBeVisible();
});
