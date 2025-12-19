import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
/** @feature USR-0661ecad
 *  Title   : Container removal function
 *  Source  : docs/client-features/usr-container-removal-function-0661ecad.yaml
 */
import { expect, test } from "../fixtures/console-forward.js";
import { TestHelpers } from "../utils/testHelpers.js";

test("delete-container returns 401 with invalid token", async ({ request }) => {
    const res = await request.post("http://localhost:7090/api/delete-container", {
        data: { idToken: "invalid", projectId: "dummy" },
    });
    expect(res.status()).toBe(401);
});

test("Project deletion redirects to home and removes project from list", async ({ page, browser }) => {
    // Create a baseline project
    const { projectName: baselineProjectName } = await TestHelpers.prepareTestEnvironment(
        page,
        test.info(),
        [],
        browser,
    );

    // Create the project to be deleted
    const { projectName: projectToDelete } = await TestHelpers.prepareTestEnvironment(page, test.info(), [], browser);

    // Navigate to the settings page and delete the project
    await page.goto(`/${projectToDelete}/settings/delete`);
    await page.waitForSelector("button:has-text('Delete')");
    await page.click("button:has-text('Delete')");

    // After deletion, should be redirected to home
    await page.waitForURL("/");

    // Wait for the container selector to be loaded
    await page.waitForSelector(".container-select");

    // Force reload to ensure fresh project list from Firestore
    await page.reload();
    await page.waitForSelector(".container-select");

    // Verify the deleted project is no longer in the list
    const containerSelect = page.locator(".container-select");
    await expect(containerSelect).not.toContainText(projectToDelete, { timeout: 20000 });

    // Verify the baseline project is still present
    await expect(containerSelect).toContainText(baselineProjectName, { timeout: 20000 });
});
