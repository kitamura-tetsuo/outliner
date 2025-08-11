import { expect, test } from "@playwright/test";

test.describe("Global Search", () => {
    test("should search across projects", async ({ page }) => {
        // Create first project
        await page.goto("/");
        await page.fill('input[placeholder="Enter project title..."]', "Project 1");
        await page.click("button[type=submit]");
        await page.waitForURL("**/Project%201");
        await page.fill('textarea', "Page 1 in Project 1");
        await page.press('textarea', "Enter");

        // Create second project
        await page.goto("/");
        await page.fill('input[placeholder="Enter project title..."]', "Project 2");
        await page.click("button[type=submit]");
        await page.waitForURL("**/Project%202");
        await page.fill('textarea', "Page 2 in Project 2");
        await page.press('textarea', "Enter");

        // Search for page in Project 1
        await page.fill('input[placeholder="Global Search"]', "Page 1");
        await expect(page.locator('li:has-text("Project 1 / Page 1 in Project 1")')).toBeVisible();

        // Search for page in Project 2
        await page.fill('input[placeholder="Global Search"]', "Page 2");
        await expect(page.locator('li:has-text("Project 2 / Page 2 in Project 2")')).toBeVisible();

        // Navigate to page in Project 1
        await page.click('li:has-text("Project 1 / Page 1 in Project 1")');
        await page.waitForURL("**/Project%201/Page%201%20in%20Project%201");
        await expect(page.locator('textarea:has-text("Page 1 in Project 1")')).toBeVisible();
    });
});
