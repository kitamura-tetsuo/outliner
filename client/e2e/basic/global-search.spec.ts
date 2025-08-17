import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

test.describe("Global Search", () => {
    test("should search across projects", async ({ page }, testInfo) => {
        // Prepare authenticated test environment
        await TestHelpers.prepareTestEnvironment(page, testInfo);

        // Create two projects and pages via API (no UI assumptions)
        await TestHelpers.createTestProjectAndPageViaAPI(
            page,
            "Project 1",
            "Page 1 in Project 1",
            ["Page 1 in Project 1"],
        );

        await TestHelpers.createTestProjectAndPageViaAPI(
            page,
            "Project 2",
            "Page 2 in Project 2",
            ["Page 2 in Project 2"],
        );

        // Go to home so Global Search is visible in layout
        await page.goto("/");

        // Search for page in Project 1
        const searchInput = page.locator('input[placeholder="Global Search"]');
        await searchInput.fill("Page 1");
        await expect(page.locator('li:has-text("Project 1 / Page 1 in Project 1")')).toBeVisible();

        // Search for page in Project 2
        await searchInput.fill("Page 2");
        await expect(page.locator('li:has-text("Project 2 / Page 2 in Project 2")')).toBeVisible();

        // Navigate to page in Project 1 and verify content is shown
        await page.click('li:has-text("Project 1 / Page 1 in Project 1")');
        await page.waitForURL("**/Project%201/Page%201%20in%20Project%201");
        await expect(page.locator('.outliner-item .item-text:has-text("Page 1 in Project 1")')).toBeVisible();
    });
});
