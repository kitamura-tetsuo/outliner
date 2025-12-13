import { expect, test } from "@playwright/test";
import { TestHelpers } from "./utils/testHelpers";

test.describe("Project Search and Filter", () => {
    test.beforeEach(async ({ page }) => {
        await TestHelpers.prepareTestEnvironment(page);
        // Create some projects to test with
        await TestHelpers.createProject(page, "Alpha Project");
        await TestHelpers.createProject(page, "Beta Project");
        await TestHelpers.createProject(page, "Gamma Project");
        await page.goto("/projects");
    });

    test("should filter projects by search term", async ({ page }) => {
        await page.locator('input[placeholder="Search projects..."]').fill("Alpha");
        await expect(page.locator(".project-card")).toHaveCount(1);
        await expect(page.locator("h3").withText("Alpha Project")).toBeVisible();

        await page.locator('input[placeholder="Search projects..."]').fill("Project");
        await expect(page.locator(".project-card")).toHaveCount(3);
    });

    test("should sort projects by name", async ({ page }) => {
        await page.locator("select").nth(0).selectOption({ label: "Sort by Name" });
        const projectTitles = await page.locator(".project-card h3").allTextContents();
        expect(projectTitles).toEqual(["Alpha Project", "Beta Project", "Gamma Project"]);
    });
});
