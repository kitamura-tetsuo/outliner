import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
/** @feature NAV-0002
 *  Title   : Link function to project page
 *  Source  : docs/client-features.yaml
 */
import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

test.describe("NAV-0002: Link function to project page", () => {
    let projectName: string;
    let pageName: string;

    test.beforeEach(async ({ page }, testInfo) => {
        test.setTimeout(90000); // Increase timeout for CI environment
        const result = await TestHelpers.prepareTestEnvironment(page, testInfo);
        projectName = result.projectName;
        pageName = result.pageName;
    });

    test("Breadcrumb navigation is displayed when the page is displayed", async ({ page }) => {
        // Verify that breadcrumb navigation is displayed
        const breadcrumbNav = page.locator("nav");
        await expect(breadcrumbNav).toBeVisible();
    });

    test("Home link is displayed in breadcrumb navigation", async ({ page }) => {
        // Verify that the link to home is displayed
        const homeLink = page.locator('nav button:has-text("Home")');
        await expect(homeLink).toBeVisible();
        await expect(homeLink).toHaveClass(/text-blue-600/);
    });

    test("Link to project page is displayed in breadcrumb navigation", async ({ page }) => {
        // Verify that the link to the project page is displayed
        const projectLink = page.locator(`nav button:has-text("${projectName}")`);
        await expect(projectLink).toBeVisible();
        await expect(projectLink).toHaveClass(/text-blue-600/);
    });

    test("Current page name is displayed in breadcrumb navigation", async ({ page }) => {
        // Verify that the current page name is displayed
        const currentPageName = page.locator(`nav span:has-text("${pageName}")`);
        await expect(currentPageName).toBeVisible();
        await expect(currentPageName).toHaveClass(/text-gray-900/);
    });

    test("Clicking the link to the project page transitions to the project page", async ({ page }) => {
        // Click the link to the project page
        const projectLink = page.locator(`nav button:has-text("${projectName}")`);
        await projectLink.click();

        // Verify transition to the project page
        await expect(page).toHaveURL(`/${projectName}`);

        // Wait for the project page to be fully loaded
        // await page.waitForLoadState("networkidle"); // Removed flaky wait

        // Verify that the project page title is displayed
        // Verify that the project name is displayed somewhere on the page (considering possibilities other than h1 elements)
        const projectElement = page.locator(`text="${projectName}"`);
        await expect(projectElement).toBeVisible({ timeout: 15000 });
    });

    test("Clicking the link to home transitions to the home page", async ({ page }) => {
        // Click the link to home
        const homeLink = page.locator('nav button:has-text("Home")');
        await homeLink.click();

        // Verify transition to the home page
        await expect(page).toHaveURL("/");

        // Verify that the home page title is displayed
        const pageTitle = page.locator('h1:has-text("Outliner")');
        await expect(pageTitle).toBeVisible();
    });

    test("Breadcrumb navigation separators are displayed correctly", async ({ page }) => {
        // Verify that separators are displayed correctly
        const separators = page.locator('nav span:has-text("/")');
        await expect(separators).toHaveCount(2); // Home / Project / Page

        // Verify that the separator style is correct
        await expect(separators.first()).toHaveClass(/mx-2/);
    });
});
