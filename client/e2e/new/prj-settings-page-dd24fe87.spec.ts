import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

test.describe("Project Settings Page", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        // Create a project first
        await TestHelpers.prepareTestEnvironment(page, testInfo);
    });

    test("should allow renaming project via settings page", async ({ page }) => {
        // We need to find the container ID to navigate to settings
        // Since we are on the project page, we can try to extract it from window.generalStore
        const containerId = await page.evaluate(() => {
            const gs = (window as any).generalStore;
            return gs?.project?.ydoc?.guid;
        });

        expect(containerId).toBeTruthy();

        // Navigate to settings
        await page.goto(`/projects/${containerId}/settings`);

        // Verify we are on settings page
        await expect(page.locator("h1")).toContainText("Settings");

        // Rename project
        const newName = `Renamed Project ${Date.now()}`;
        await page.fill('input[id="project-name"]', newName);
        await page.click('button:has-text("Save")');

        // Verify success message
        await expect(page.getByText("Project renamed successfully")).toBeVisible();

        // Verify title update in header
        await expect(page.locator("h1")).toContainText(newName);
    });

    test("should allow toggling public access", async ({ page }) => {
        const containerId = await page.evaluate(() => {
            const gs = (window as any).generalStore;
            return gs?.project?.ydoc?.guid;
        });

        await page.goto(`/projects/${containerId}/settings`);

        // Switch to Sharing tab
        await page.click('button:has-text("Sharing")');

        // Toggle public access
        await page.click('button[role="switch"]');

        // Verify public link appears
        await expect(page.locator('label:has-text("Public Link")')).toBeVisible();
        await expect(page.locator('input[id="public-link"]')).toBeVisible();

        // Verify message
        await expect(page.getByText("Project is now public")).toBeVisible();
    });
});
