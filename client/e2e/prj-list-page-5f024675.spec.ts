import { expect, test } from "@playwright/test";
import { TestHelpers } from "./utils/testHelpers";

test.describe("Project List Page", () => {
    test.beforeEach(async ({ page }) => {
        await TestHelpers.prepareTestEnvironment(page);
        await page.goto("/projects");
    });

    test("should display the project list page", async ({ page }) => {
        await expect(page.locator("h1").withText("Projects")).toBeVisible();
        await expect(page.locator("button").withText("New Project")).toBeVisible();
    });

    test("should display a list of projects", async ({ page }) => {
        // Create a dummy project to ensure the list is not empty
        await TestHelpers.createProject(page, "Test Project 1");
        await page.goto("/projects");

        await expect(page.locator(".project-card")).toHaveCount(1);
        await expect(page.locator("h3").withText("Test Project 1")).toBeVisible();
    });
});
