import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

test.describe("Project Renaming", () => {
    test("should allow a user to rename a project", async ({ page }) => {
        const { projectName } = await TestHelpers.prepareTestEnvironment(page);

        // Store the project name in sessionStorage before navigating to settings
        // This allows the settings page to retrieve the project context
        await page.evaluate((name) => {
            window.sessionStorage?.setItem("TEST_CURRENT_PROJECT_NAME", name);
        }, projectName);

        // Navigate to the settings page
        await page.goto("/settings");

        // Wait for the settings page to load
        await expect(page.locator("h1")).toHaveText("Settings");

        // Wait for the project to be available in the store (either from sessionStorage or URL)
        await page.waitForFunction(
            () => {
                const project = (window as any).appStore?.project;
                const title = project?.title;
                return project && title && title !== "settings";
            },
            undefined,
            { timeout: 10000 },
        );

        // Find the input and button
        const newProjectNameInput = page.locator('input[aria-label="New project name"]');
        const renameButton = page.locator("button", { hasText: "Rename" });

        // Enter a new project name
        const newProjectName = "Renamed Project";
        await newProjectNameInput.fill(newProjectName);

        // Click the rename button
        await renameButton.click();

        // Wait for the project name to be updated in the store
        await page.waitForFunction(
            (expectedName) => {
                const project = (window as any).appStore?.project;
                return project?.title === expectedName;
            },
            newProjectName,
            { timeout: 10000 },
        );

        // Verify the project name in the settings page UI
        await expect(page.locator("p > strong")).toHaveText(newProjectName);

        // Navigate back to the main page and verify the name is updated there as well
        await page.goto("/");
        await page.waitForFunction(
            (expectedName) => {
                const project = (window as any).__CURRENT_PROJECT__;
                return project?.title === expectedName;
            },
            newProjectName,
            { timeout: 10000 },
        );
    });
});
