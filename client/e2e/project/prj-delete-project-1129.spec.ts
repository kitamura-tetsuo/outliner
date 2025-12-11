import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

test.describe("Project Deletion", () => {
    test("should be able to delete a project", async ({ page }) => {
        await TestHelpers.prepareTestEnvironment(page);
        const projectTitle = "Test Project to Delete";
        await TestHelpers.createTestProjectAndPageViaAPI(page, projectTitle, "page");

        await page.goto("/projects/delete");
        await page.waitForLoadState("networkidle");

        await page.click(`button:has-text("Delete")`);

        await expect(page.locator("h2")).toHaveText("Delete Project");

        await page.fill("input[type='text']", projectTitle);
        await page.click("button:has-text('Delete')");

        // Verify the project is no longer in the main list
        await page.goto("/projects");
        await expect(page.locator(`text=${projectTitle}`)).not.toBeVisible();

        // Verify the project is in the trash
        await page.goto("/projects/trash");
        await expect(page.locator(`text=${projectTitle}`)).toBeVisible();
    });
});
