import { registerCoverageHooks } from "./utils/registerCoverageHooks";
registerCoverageHooks();
import { expect, test } from "@playwright/test";
import { TestHelpers } from "./utils/testHelpers";

test.describe("Project List Page", () => {
    test.beforeEach(async ({ page }) => {
        await TestHelpers.prepareTestEnvironment(page);
        await page.goto("/projects");
    });

    test("should display the project list page", async ({ page }) => {
        await expect(page.getByRole("heading", { level: 1, name: "Projects" })).toBeVisible();
        await expect(page.getByRole("button", { name: "New Project" })).toBeVisible();
    });

    test("should display a list of projects", async ({ page }) => {
        // Create a dummy project to ensure the list is not empty
        await TestHelpers.createProject(page, "Test Project 1");
        await page.goto("/projects");

        await expect(page.locator(".project-card")).toHaveCount(1);
        await expect(page.getByRole("heading", { level: 3, name: "Test Project 1" })).toBeVisible();
    });
});
