import { test, expect } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

test.describe("Trash UI", () => {
    test("should display deleted projects and allow permanent deletion", async ({ page }) => {
        await TestHelpers.prepareTestEnvironment(page);
        const projectTitle = "Test Project for Trash UI";
        await TestHelpers.createTestProjectAndPageViaAPI(page, projectTitle, "page");

        await page.goto("/projects/delete");
        await page.waitForLoadState("networkidle");

        // Soft delete the project
        await page.click(`button:has-text("Delete")`);
        await page.fill("input[type='text']", projectTitle);
        await page.click("button:has-text('Delete')");

        // Go to trash and verify the project is listed
        await page.goto("/projects/trash");
        await expect(page.locator(`text=${projectTitle}`)).toBeVisible();

        // Permanently delete the project
        await page.click(`button:has-text("Delete Permanently")`);

        // Handle the confirmation dialog
        await page.fill("input[type='text']", projectTitle);
        await page.click("button:has-text('Delete Permanently')");

        // Verify the project is no longer in the trash
        await expect(page.locator(`text=${projectTitle}`)).not.toBeVisible();
    });
});
