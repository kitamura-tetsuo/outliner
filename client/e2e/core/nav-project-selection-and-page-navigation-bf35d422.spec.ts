import "../utils/registerAfterEachSnapshot";
import { expect, test } from "@playwright/test";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
import { TestHelpers } from "../utils/testHelpers";
registerCoverageHooks();

/**
 * @feature NAV-0001
 * @title Project selection and page navigation
 * @description Function to transition to the project page when a project is selected on the root page, and transition from the project page to an individual page via the page list
 * @source docs/client-features.yaml
 */

test.describe("NAV-0001: Project selection and page navigation", () => {
    /**
     * @testcase Confirmation of project selection and page navigation functionality
     * @description Test to confirm transition to the project page and transition to the page
     */
    test("Confirmation of project selection and page navigation functionality", async ({ page }, testInfo) => {
        // Prepare the test environment by creating the project and page programmatically
        const { projectName, pageName } = await TestHelpers.prepareTestEnvironment(page, testInfo, []);

        // 1. Confirm transition to the project page
        await page.goto(`/${projectName}`, { waitUntil: "load" });
        await page.waitForTimeout(500); // Wait for hydration and rendering
        await expect(page).toHaveURL(new RegExp(`.*/${encodeURIComponent(projectName)}$`), { timeout: 10000 });
        const projectUrl = page.url();
        expect(projectUrl).toContain(encodeURIComponent(projectName));

        // Wait for the project name to appear in the h1 element
        // The project page shows the project name in h1 after the project data is loaded
        await expect(page.locator("main h1")).toContainText(projectName, { timeout: 15000 });

        // 2. Confirm transition to the page
        await page.goto(`/${projectName}/${pageName}`);
        await expect(page).toHaveURL(
            new RegExp(`.*/${encodeURIComponent(projectName)}/${encodeURIComponent(pageName)}$`),
            { timeout: 10000 },
        );
        const pageUrl = page.url();
        expect(pageUrl).toContain(`${encodeURIComponent(projectName)}/${encodeURIComponent(pageName)}`);
    });
});
