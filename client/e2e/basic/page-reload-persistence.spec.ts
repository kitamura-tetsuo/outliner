import { expect, test } from "@playwright/test";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
import { TestHelpers } from "../utils/testHelpers";

registerCoverageHooks();

test.describe("Page Creation and Reload Persistence", () => {
    test("should persist a new page and its content after reload", async ({ page }, testInfo) => {
        // 1. Setup project (creates a project and navigates to its root indirectly via createAndSeedProject)
        // We seed an empty project to start with.
        const { projectName } = await TestHelpers.createAndSeedProject(page, testInfo, []);

        // 2. Go to project root (Project Index Page)
        // Ensure we properly encode the project name
        await page.goto(`/${encodeURIComponent(projectName)}`);

        // Ensure we are on the project page
        await expect(page.locator("h1")).toContainText(projectName);

        // 3. Create a new page via UI
        const newPageName = `Persistence Test Page ${Date.now()}`;
        const pageNameInput = page.locator('input[placeholder="New page name"]');
        await expect(pageNameInput).toBeVisible();
        await pageNameInput.fill(newPageName);

        const createButton = page.locator('button[aria-label="Create new page"]');
        await createButton.click();

        // 4. Verify navigation to the new page
        const encodedProjectName = encodeURIComponent(projectName).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const encodedPageName = encodeURIComponent(newPageName).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const expectedUrlPattern = new RegExp(`/${encodedProjectName}/${encodedPageName}`);

        console.log(`Expecting URL pattern: ${expectedUrlPattern}`);
        await expect(page).toHaveURL(expectedUrlPattern);

        // Wait for page to be ready
        await expect(page.locator("h1")).toContainText(newPageName);
        await TestHelpers.waitForAppReady(page);

        // 5. Add some content
        // Click "Add Item" button in the toolbar to create the first item
        await page.getByTestId("page-toolbar").getByRole("button", { name: "Add Item" }).click();

        // Wait for the outliner item with data-item-id to appear in the MAIN outliner
        // index 0 is the page title, index 1 is the first child item we just added
        const outliner = page.getByTestId("outliner-base");
        const newItem = outliner.locator(".outliner-item[data-item-id]").nth(1);
        await newItem.waitFor({ state: "visible", timeout: 15000 });
        await newItem.click();
        await page.keyboard.type("Hello World Persistence Test");
        // Wait for a bit to ensure it's synced/saved
        await page.waitForTimeout(2000);

        // 6. Reload the page
        console.log("Reloading page...");
        await page.reload();

        // 7. Verify persistence
        // Check URL again
        await expect(page).toHaveURL(expectedUrlPattern);

        // Wait for page to load again
        await expect(page.locator("h1")).toContainText(newPageName);
        await TestHelpers.waitForAppReady(page);

        // Check if content is still there
        // index 0 is the page title, index 1 is the first child item we added
        await outliner.locator(".outliner-item[data-item-id]").nth(1).waitFor({ state: "visible", timeout: 15000 });
        await expect(outliner).toContainText("Hello World Persistence Test");
    });
});
