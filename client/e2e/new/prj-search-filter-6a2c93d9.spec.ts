import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

test.describe("Project Search and Filter", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        // Create multiple projects
        // 1. First project
        await TestHelpers.createTestProjectAndPageViaAPI(page, "Alpha Project", "Page 1");
        // 2. Second project
        await TestHelpers.createTestProjectAndPageViaAPI(page, "Beta Project", "Page 1");

        // Go to projects list
        await page.goto("/projects");
    });

    test("should search projects by name", async ({ page }) => {
        // Wait for projects to appear
        await page.waitForSelector(".project-card");

        // Search for "Alpha"
        await page.fill('input[placeholder="Search projects..."]', "Alpha");

        // Verify only Alpha is visible
        await expect(page.locator(".project-card")).toHaveCount(1);
        await expect(page.locator(".project-card")).toContainText("Alpha Project");

        // Search for "Beta"
        await page.fill('input[placeholder="Search projects..."]', "Beta");

        // Verify only Beta is visible
        await expect(page.locator(".project-card")).toHaveCount(1);
        await expect(page.locator(".project-card")).toContainText("Beta Project");
    });
});
