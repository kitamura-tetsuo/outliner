import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
/** @feature NAV-0002
 *  Title   : Navigation Link Functionality to Project Page
 *  Source  : docs/client-features.yaml
 */
import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

// The route to a project used to be a breadcrumb above the editor. Page views
// no longer carry that chrome (HDR-6a4c2f1e): the global toolbar names the
// project and links to it, and the project page keeps its own breadcrumb.
test.describe("NAV-0002: Navigation Link Functionality to Project Page", () => {
    let projectName: string;

    test.beforeEach(async ({ page }, testInfo) => {
        test.setTimeout(90000); // Increase timeout for CI environment
        const result = await TestHelpers.seedProjectAndNavigate(page, testInfo);
        projectName = result.projectName;
    });

    test("The project link lives in the global toolbar, not in a page breadcrumb", async ({ page }) => {
        const projectLink = page.getByTestId("toolbar-project-name");
        await expect(projectLink).toBeVisible({ timeout: 30000 });
        await expect(projectLink).toHaveText(projectName);
        await expect(projectLink).toHaveAttribute("href", new RegExp(`/${encodeURIComponent(projectName)}$`));

        await expect(page.locator('nav[aria-label="Breadcrumb"]')).toHaveCount(0);
    });

    test("Clicking the toolbar project name navigates to the project page", async ({ page }) => {
        const projectLink = page.getByTestId("toolbar-project-name");
        await expect(projectLink).toBeVisible({ timeout: 30000 });
        await projectLink.click();

        await expect(page).toHaveURL(`/${projectName}`);

        const projectElement = page.locator(`h1:has-text("${projectName}")`);
        await expect(projectElement).toBeVisible({ timeout: 15000 });
    });

    test("The project page keeps its breadcrumb back to home", async ({ page }) => {
        await page.goto(`/${encodeURIComponent(projectName)}`);

        const breadcrumb = page.locator('nav[aria-label="Breadcrumb"]').first();
        await expect(breadcrumb).toBeVisible({ timeout: 30000 });

        const homeLink = breadcrumb.locator('a:has-text("Home")');
        await expect(homeLink).toBeVisible();
        await expect(homeLink).toHaveClass(/text-blue-600/);

        const currentProject = breadcrumb.locator(`span:has-text("${projectName}")`);
        await expect(currentProject).toBeVisible();
        await expect(currentProject).toHaveClass(/text-gray-900/);

        // Home / Project — one separator.
        const separators = breadcrumb.locator('li:has-text("/")');
        await expect(separators).toHaveCount(1);
        await expect(separators.first()).toHaveClass(/text-gray-500/);
    });

    test("Clicking home from the project page navigates to the home page", async ({ page }) => {
        await page.goto(`/${encodeURIComponent(projectName)}`);

        const homeLink = page.locator('nav[aria-label="Breadcrumb"] a:has-text("Home")').first();
        await expect(homeLink).toBeVisible({ timeout: 30000 });
        await homeLink.click();

        await expect(page).toHaveURL("/");
        await expect(page.locator('h1:has-text("Outliner")')).toBeVisible();
    });
});
