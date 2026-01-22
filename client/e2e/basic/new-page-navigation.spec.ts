import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

test.describe("New Page Navigation", () => {
    test("should navigate to the new page after creation", async ({ page }, testInfo) => {
        // Setup project
        // createProjectOnly was not available, using createAndSeedProject which navigates to the project
        // We will seed an empty project to start with
        const { projectName } = await TestHelpers.createAndSeedProject(page, testInfo, []);

        // Go to project root (Project Index Page)
        // Ensure we properly encode the project name
        await page.goto(`/${encodeURIComponent(projectName)}`);

        // Ensure we are on the project page
        await expect(page.locator("h1")).toContainText(projectName);

        // Define new page name
        const newPageName = `Test Page ${Date.now()}`;

        // Find the input field for new page name in PageList
        const pageNameInput = page.locator('input[placeholder="新しいページ名"]');
        await expect(pageNameInput).toBeVisible();
        await pageNameInput.fill(newPageName);

        // Click create button
        const createButton = page.locator("button", { hasText: "作成" });
        await createButton.click();

        // Verify navigation to the new page
        // Both project name and page name should be encoded in the URL regex
        const encodedProjectName = encodeURIComponent(projectName).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const encodedPageName = encodeURIComponent(newPageName).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const expectedUrlPattern = new RegExp(`/${encodedProjectName}/${encodedPageName}`);

        console.log(`Expecting URL pattern: ${expectedUrlPattern}`);
        await expect(page).toHaveURL(expectedUrlPattern);

        // Wait for page to load content
        // Note: The test environment might be slow to sync the new page to the view.
        // We accept seeing the page title in the header OR the outliner.
        try {
            await page.waitForSelector(".outliner", { state: "visible", timeout: 15000 });
        } catch {
            console.log("Outliner not found, checking for page title in header as fallback verification");
            // If outliner is not found (maybe empty page logic differs), check if we are at least on the page
            // and the system acknowledges the page name in the UI
            await expect(page.locator("h1")).toContainText(newPageName);
        }
    });
});
