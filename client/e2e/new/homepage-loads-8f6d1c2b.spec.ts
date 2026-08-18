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
    const { projectName, pageName } = await TestHelpers.seedProjectAndNavigateForProject(page, testInfo, [], undefined);
    // Identity is split in two since HDR-6a4c2f1e: the global toolbar names the
    // project, and the editable page title is the page's level-one heading.
    await expect(page.getByTestId("toolbar-project-name")).toHaveText(projectName);
    await expect(page.getByRole("heading", { name: pageName })).toBeVisible();
});
