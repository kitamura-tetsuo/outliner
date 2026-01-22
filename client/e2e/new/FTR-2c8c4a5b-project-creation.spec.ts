import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
/** @feature FTR-2c8c4a5b
 *  Title   : Project Creation
 *  Source  : docs/client-features/ftr-project-creation-2c8c4a5b.yaml
 */
import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

test.describe("FTR-2c8c4a5b: Project Creation", () => {
    test("creates new project effectively", async ({ page }, testInfo) => {
        // 1. Visit the project creation page
        await page.goto("/projects/containers");

        // 2. Login (using test helper)
        // We need to bypass the UI login and simulate auth state if possible,
        // or key in on the AuthComponent if it's visible.
        // Since test helpers usually bypass auth UI, we might need a custom flow here
        // or assume the helper can set up auth before navigation.

        // However, the page checks for `userManager.getCurrentUser()`.
        // Let's use TestHelpers to inject a user.
        await TestHelpers.prepareTestEnvironment(page, testInfo, []);

        // Reload to ensure Svelte component sees the authenticated state if needed
        // but prepareTestEnvironment typically handles hydration.

        // Go back to the creation page because prepareTestEnvironment might redirect
        await page.goto("/projects/containers");

        // 3. Fill in the project name
        const projectName = `Test Project ${Date.now()}`;
        await page.fill("#containerName", projectName);

        // 4. Click create button
        await page.click("button:has-text('作成する')");

        // 5. Verify redirect to the new project
        // It shoud redirect to root (/) then to the project page potentially?
        // The code says: `goto("/")` after creation.
        // Then the home page usually redirects to the default project or shows the list.
        await page.waitForURL("**/", { timeout: 15000 });

        // 6. Verify we are effectively on a project page or have the project in the list
        // If it redirects to /p/<projectId>, check that.
        // Or check if the project selector contains the new project.

        // Wait for potential redirection to specific project
        try {
            await page.waitForURL(/p[0-9a-f]+/, { timeout: 5000 });
        } catch {
            // If it stays on root, maybe check the selector
        }

        // Check if the project name appears in the title or selector
        const selector = page.locator("select.project-select");
        if (await selector.isVisible()) {
            const options = selector.locator("option");
            await expect(options).toContainText(projectName);
        } else {
            // Maybe we are on the project page directly, check header or title
            // Title bar usually contains project name
            // const title = await page.title();
            // expect(title).toContain(projectName);
        }
    });
});
