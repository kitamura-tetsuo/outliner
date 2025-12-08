import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

test.describe("Project List Page", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        // Initialize environment and go to home page
        await TestHelpers.prepareTestEnvironmentForProject(page, testInfo);
    });

    test("should display projects list and allow creating new project", async ({ page }) => {
        // Navigate to projects list
        await page.goto("/projects");

        // Verify title
        await expect(page.locator("h1")).toHaveText("Projects");

        // Verify New Project button
        const createBtn = page.getByRole("button", { name: "New Project" });
        await expect(createBtn).toBeVisible();

        // Create new project
        await createBtn.click();

        // Should navigate to new project page (URL starts with /Untitled Project)
        await expect(page).toHaveURL(/Untitled%20Project/);

        // Verify project loaded
        await TestHelpers.waitForOutlinerItems(page);
    });
});
