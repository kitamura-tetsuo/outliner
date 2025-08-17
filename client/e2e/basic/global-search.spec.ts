import { expect, test } from "../fixtures/console-forward";
import { TestHelpers } from "../utils/testHelpers";

test.describe("Global Search", () => {
    test("should search across projects", async ({ page }, testInfo) => {
        // Prepare authenticated test environment and navigate to a baseline project/page
        const base = await TestHelpers.prepareTestEnvironment(page, testInfo, []);

        // Create two additional projects and pages via API (cross-project search targets)
        const project1 = `GlobalSearchProj1-${Date.now()}`;
        const page1 = `GlobalPage1-${Date.now()}`;
        await TestHelpers.createTestProjectAndPageViaAPI(page, project1, page1, ["content 1"]);

        const project2 = `GlobalSearchProj2-${Date.now()}`;
        const page2 = `GlobalPage2-${Date.now()}`;
        await TestHelpers.createTestProjectAndPageViaAPI(page, project2, page2, ["content 2"]);

        // Ensure we are on a project page where the global search box is rendered
        await page.goto(`/${encodeURIComponent(base.projectName)}/${encodeURIComponent(base.pageName)}`);

        // Search for page in Project 1
        await page.waitForSelector(".page-search-box input");
        await page.fill(".page-search-box input", page1.replace(/-.+$/, "")); // type partial prefix
        await expect(page.locator(`.page-search-box li button:has-text("${project1} / ${page1}")`)).toBeVisible();

        // Search for page in Project 2
        await page.fill(".page-search-box input", page2.replace(/-.+$/, ""));
        await expect(page.locator(`.page-search-box li button:has-text("${project2} / ${page2}")`)).toBeVisible();

        // Navigate to page in Project 2 and verify URL
        await page.click(`.page-search-box li button:has-text("${project2} / ${page2}")`);
        await expect(page).toHaveURL(new RegExp(`/${encodeURIComponent(project2)}/${encodeURIComponent(page2)}`));
    });
});
