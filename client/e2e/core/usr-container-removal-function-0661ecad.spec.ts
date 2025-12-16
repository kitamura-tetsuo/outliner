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
    test.setTimeout(60000);
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

    // Wait for the yjsStore to have the current container ID loaded
    // This is needed because the layout loads the project asynchronously
    await page.waitForFunction(
        () => {
            const store = (window as any).__YJS_STORE__;
            return store?.currentContainerId !== null && store?.currentContainerId !== undefined;
        },
        { timeout: 10000 },
    );

    await page.click("button:has-text('Delete')");

    // After deletion, should be redirected to home
    await page.waitForURL("/");
    await page.waitForLoadState("domcontentloaded");

    // Verify the deleted project is no longer visible
    const deleteProjectOption = page.locator(`select.container-select option:has-text("${projectToDelete}")`);
    await expect(deleteProjectOption).not.toBeAttached({ timeout: 20000 });

    // Verify the baseline project is still present
    const baselineProjectOption = page.locator(`select.container-select option:has-text("${baselineProjectName}")`);
    await expect(baselineProjectOption).toBeAttached({ timeout: 20000 });
});
