import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
/** @feature NAV-0002
 *  Title   : Navigation Link Functionality to Project Page
 *  Source  : docs/client-features.yaml
 */
import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

test.describe("NAV-0002: Navigation Link Functionality to Project Page", () => {
    let projectName: string;
    let pageName: string;

    test.beforeEach(async ({ page }, testInfo) => {
        test.setTimeout(90000); // Increase timeout for CI environment
        const result = await TestHelpers.prepareTestEnvironment(page, testInfo);
        projectName = result.projectName;
        pageName = result.pageName;
    });

    test("Breadcrumb navigation is displayed when page is shown", async ({ page }) => {
        // Verify that breadcrumb navigation is displayed
        const breadcrumbNav = page.locator("nav");
        await expect(breadcrumbNav).toBeVisible();
    });

    test("Home link is displayed in breadcrumb navigation", async ({ page }) => {
        // Verify that home link is displayed
        const homeLink = page.locator('nav button:has-text("Home")');
        await expect(homeLink).toBeVisible();
        await expect(homeLink).toHaveClass(/text-blue-600/);
    });

    test("Project page link is displayed in breadcrumb navigation", async ({ page }) => {
        // Verify that project page link is displayed
        const projectLink = page.locator(`nav button:has-text("${projectName}")`);
        await expect(projectLink).toBeVisible();
        await expect(projectLink).toHaveClass(/text-blue-600/);
    });

    test("Current page name is displayed in breadcrumb navigation", async ({ page }) => {
        // Verify that current page name is displayed
        const currentPageName = page.locator(`nav span:has-text("${pageName}")`);
        await expect(currentPageName).toBeVisible();
        await expect(currentPageName).toHaveClass(/text-gray-900/);
    });

    test("Clicking project page link navigates to project page", async ({ page }) => {
        // Click the project page link
        const projectLink = page.locator(`nav button:has-text("${projectName}")`);
        await projectLink.click();

        // Verify transition to project page
        await expect(page).toHaveURL(`/${projectName}`);

        // Wait for project page to fully load
        // await page.waitForLoadState("networkidle"); // Removed flaky wait

        // Verify that project page title is displayed
        // Verify that project name is displayed somewhere on the page (considering possibilities other than h1 elements)
        const projectElement = page.locator(`text="${projectName}"`);
        await expect(projectElement).toBeVisible({ timeout: 15000 });
    });

    test("Clicking home link navigates to home page", async ({ page }) => {
        // Click the home link
        const homeLink = page.locator('nav button:has-text("Home")');
        await homeLink.click();

        // Verify transition to home page
        await expect(page).toHaveURL("/");

        // Verify that home page title is displayed
        const pageTitle = page.locator('h1:has-text("Outliner")');
        await expect(pageTitle).toBeVisible();
    });

    test("Separator characters in breadcrumb navigation are displayed correctly", async ({ page }) => {
        // Verify that separator characters are displayed correctly
        const separators = page.locator('nav span:has-text("/")');
        await expect(separators).toHaveCount(2); // Home / Project / Page

        // Verify that separator character style is correct
        await expect(separators.first()).toHaveClass(/mx-2/);
    });
});
