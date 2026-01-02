import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
/** @feature PRJ-Selector
 *  Title   : Project Selector
 *  Source  : docs/client-features/prj-project-selector.yaml
 */
import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

test.describe.serial("Prj: Project Selector", () => {
    // Basic setup for tests that don't depend on existing projects
    test.beforeEach(async ({ page }, testInfo) => {
        // hook handling if needed
    });

    /**
     * Test 1: Project selector shows available options
     */
    test("project selector shows options", async ({ page }, testInfo) => {
        // Use setAccessibleProjects to simulate having projects without full seeding
        await page.goto("/");
        await TestHelpers.setAccessibleProjects(page, ["project-A", "project-B"]);

        // Wait for store update
        await page.waitForFunction(() => {
            const ps = (window as any).__PROJECT_STORE__;
            return ps && ps.projects && ps.projects.length >= 2;
        }, { timeout: 10000 });

        // Check if selector options are rendered
        const selector = page.locator("select.project-select");
        await expect(selector).toBeVisible();
        await expect(selector).toHaveCount(1);

        const options = selector.locator("option");
        // Expect at least 2 options (plus possibly a default/placeholder)
        await expect(options).toHaveCount(2);
    });

    /**
     * Test 2: Project selector lists projects from store
     */
    test("project selector lists projects from store", async ({ page }, testInfo) => {
        // 1. Prepare environment with known project
        const { projectName } = await TestHelpers.prepareTestEnvironmentForProject(page, testInfo, ["Data line 1"]);

        // 2. Navigate away to root to see the selector
        await page.goto("/");

        // 3. Inject accessible projects including the one we just created + others
        const extraProject = "Extra Project " + Date.now();
        await TestHelpers.setAccessibleProjects(page, [projectName, extraProject]);

        // 4. Wait for store to reflect
        await page.waitForFunction(() => {
            const ps = (window as any).__PROJECT_STORE__;
            return ps && ps.projects && ps.projects.length >= 2;
        }, { timeout: 10000 });

        // 5. Verify selector contents
        const selector = page.locator("select.project-select");
        await expect(selector).toBeVisible();

        const optionText = await selector.textContent();
        expect(optionText).toContain(projectName);
        expect(optionText).toContain(extraProject);
    });

    /**
     * Test 3: Switching project via selector works
     */
    test("switching project via selector navigates", async ({ page }, testInfo) => {
        // 1. Setup with multiple projects
        await page.goto("/");
        const project1 = "Project One";
        const project2 = "Project Two";
        await TestHelpers.setAccessibleProjects(page, [project1, project2]);

        // 2. Wait for selector
        await page.waitForFunction(() => {
            const ps = (window as any).__PROJECT_STORE__;
            return ps && ps.projects && ps.projects.length >= 2;
        }, { timeout: 10000 });

        // 3. Select Project Two
        const selector = page.locator("select.project-select");
        await selector.selectOption({ value: project2 });

        // 4. Verify navigation
        // The app should navigate to /Project Two
        await expect(page).toHaveURL(new RegExp(encodeURIComponent(project2)));
    });
});
