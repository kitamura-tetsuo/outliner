import { test, expect } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

test.describe("Project Restoration", () => {
    test("should be able to restore a project from the trash", async ({ page }) => {
        await TestHelpers.prepareTestEnvironment(page);
        const projectTitle = "Test Project to Restore";
        await TestHelpers.createTestProjectAndPageViaAPI(page, projectTitle, "page");

        await page.goto("/projects/delete");
        await page.waitForLoadState("networkidle");

        // Soft delete the project first
        await page.click(`button:has-text("Delete")`);
        await page.fill("input[type='text']", projectTitle);
        await page.click("button:has-text('Delete')");


        // Go to trash and restore it
        await page.goto("/projects/trash");
        await page.click(`button:has-text("Restore")`);

        // Verify the project is back in the main list
        await page.goto("/projects");
        await expect(page.locator(`text=${projectTitle}`)).toBeVisible();

        // Verify the project is no longer in the trash
        await page.goto("/projects/trash");
        await expect(page.locator(`text=${projectTitle}`)).not.toBeVisible();
    });
});
