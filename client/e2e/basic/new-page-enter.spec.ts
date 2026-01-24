import { expect, test } from "@playwright/test";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
import { TestHelpers } from "../utils/testHelpers";
registerCoverageHooks();

test.describe("New Page Creation with Enter", () => {
    test("should navigate to the new page after pressing Enter", async ({ page }, testInfo) => {
        // Setup project
        const { projectName } = await TestHelpers.createAndSeedProject(page, testInfo, []);

        // Go to project root (Project Index Page)
        await page.goto(`/${encodeURIComponent(projectName)}`);

        // Ensure we are on the project page
        await expect(page.locator("h1")).toContainText(projectName);

        // Define new page name
        const newPageName = `Enter Page ${Date.now()}`;

        // Find the input field for new page name in PageList
        const pageNameInput = page.locator('input[placeholder="新しいページ名"]');
        await expect(pageNameInput).toBeVisible();
        await pageNameInput.fill(newPageName);

        // Press Enter
        await pageNameInput.press("Enter");

        // Verify navigation to the new page
        const encodedProjectName = encodeURIComponent(projectName).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const encodedPageName = encodeURIComponent(newPageName).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const expectedUrlPattern = new RegExp(`/${encodedProjectName}/${encodedPageName}`);

        console.log(`Expecting URL pattern: ${expectedUrlPattern}`);
        await expect(page).toHaveURL(expectedUrlPattern);

        // Verify content to be sure
        try {
            await page.waitForSelector(".outliner", { state: "visible", timeout: 15000 });
        } catch {
            console.log("Outliner not found, checking for page title in header as fallback verification");
            await expect(page.locator("h1")).toContainText(newPageName);
        }
    });
});
