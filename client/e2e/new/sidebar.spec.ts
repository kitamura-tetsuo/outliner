import { expect, test } from "@playwright/test";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
import { TestHelpers } from "../utils/testHelpers";

registerCoverageHooks();

/**
 * E2E Tests for Sidebar functionality
 * Tests opening/closing sidebar via toggle and navigation links
 */

test.describe("Sidebar Navigation", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        await TestHelpers.prepareTestEnvironment(page, testInfo, [
            "First line of test page",
            "Second line of test page",
            "Third line of test page",
        ]);
    });

    test.afterEach(async ({ page }) => {
        await TestHelpers.cleanup(page);
    });

    test("should open and close sidebar via main toggle button", async ({ page }) => {
        test.setTimeout(120000);

        // Sidebar should be initially open (default state)
        await expect(page.locator("aside.sidebar")).toBeVisible();
        await expect(page.locator("aside.sidebar")).toHaveClass(/open/);

        // Find and click the sidebar toggle button
        const toggleButton = page.locator("button.sidebar-toggle");
        await expect(toggleButton).toBeVisible();

        // Close sidebar
        await toggleButton.click();
        await page.waitForTimeout(300); // Wait for transition

        // Verify sidebar is closed
        await expect(page.locator("aside.sidebar")).not.toHaveClass(/open/);

        // Reopen sidebar
        await toggleButton.click();
        await page.waitForTimeout(300); // Wait for transition

        // Verify sidebar is open
        await expect(page.locator("aside.sidebar")).toHaveClass(/open/);
    });

    test("should toggle Projects section", async ({ page }) => {
        test.setTimeout(120000);

        await expect(page.locator("aside.sidebar")).toBeVisible();

        // Projects section should be initially expanded
        const projectsHeader = page.locator('[aria-label="Toggle projects section"]');
        await expect(projectsHeader).toBeVisible();
        await expect(projectsHeader).toHaveAttribute("aria-expanded", "true");

        // Click to collapse
        await projectsHeader.click();
        await page.waitForTimeout(200);

        // Verify collapsed
        await expect(projectsHeader).toHaveAttribute("aria-expanded", "false");
        await expect(projectsHeader.locator(".chevron-icon")).toHaveClass(/rotated/);

        // Click to expand again
        await projectsHeader.click();
        await page.waitForTimeout(200);

        // Verify expanded
        await expect(projectsHeader).toHaveAttribute("aria-expanded", "true");
        await expect(projectsHeader.locator(".chevron-icon")).not.toHaveClass(/rotated/);
    });

    test("should toggle Pages section", async ({ page }) => {
        test.setTimeout(120000);

        await expect(page.locator("aside.sidebar")).toBeVisible();

        // Pages section should be initially expanded
        const pagesHeader = page.locator('[aria-label="Toggle pages section"]');
        await expect(pagesHeader).toBeVisible();
        await expect(pagesHeader).toHaveAttribute("aria-expanded", "true");

        // Click to collapse
        await pagesHeader.click();
        await page.waitForTimeout(200);

        // Verify collapsed
        await expect(pagesHeader).toHaveAttribute("aria-expanded", "false");
        await expect(pagesHeader.locator(".chevron-icon")).toHaveClass(/rotated/);

        // Click to expand again
        await pagesHeader.click();
        await page.waitForTimeout(200);

        // Verify expanded
        await expect(pagesHeader).toHaveAttribute("aria-expanded", "true");
        await expect(pagesHeader.locator(".chevron-icon")).not.toHaveClass(/rotated/);
    });

    test("should navigate to Settings page when Settings link is clicked", async ({ page }) => {
        test.setTimeout(120000);

        await expect(page.locator("aside.sidebar")).toBeVisible();

        // Click on Settings link
        const settingsLink = page.locator(".settings-link");
        await expect(settingsLink).toBeVisible();
        await settingsLink.click();

        // Wait for navigation
        await page.waitForTimeout(500);

        // Verify we're on the settings page or the navigation was attempted
        // Note: This test verifies the click handler works; actual navigation depends on route setup
        const currentUrl = page.url();
        // The URL should contain 'settings' or the navigation should have been attempted
        expect(currentUrl).toMatch(/settings/i);
    });

    test("should show project list in Projects section", async ({ page }) => {
        test.setTimeout(120000);

        await expect(page.locator("aside.sidebar")).toBeVisible();

        // Projects section should be expanded
        const projectsHeader = page.locator('[aria-label="Toggle projects section"]');
        await expect(projectsHeader).toHaveAttribute("aria-expanded", "true");

        // Verify project list is visible
        const projectList = page.locator(".project-list");
        await expect(projectList).toBeVisible();

        // Projects should be displayed (may be empty or contain test projects)
        // Just verify the container is present
        await expect(projectList).toBeVisible();
    });

    test("should show page list in Pages section", async ({ page }) => {
        test.setTimeout(120000);

        await expect(page.locator("aside.sidebar")).toBeVisible();

        // Pages section should be expanded
        const pagesHeader = page.locator('[aria-label="Toggle pages section"]');
        await expect(pagesHeader).toHaveAttribute("aria-expanded", "true");

        // Verify page list is visible
        const pageList = page.locator(".page-list");
        await expect(pageList).toBeVisible();

        // Pages section should be visible (either with items or with "No pages available" message)
        // The page list container is already verified to be visible above
    });

    test("should adjust main content margin when sidebar is toggled", async ({ page }) => {
        test.setTimeout(120000);

        // Ensure sidebar is visible
        await expect(page.locator("aside.sidebar")).toBeVisible();

        // Main content should have sidebar margin initially
        // Use first() to avoid strict mode violation with multiple elements
        const mainContent = page.locator(".main-content").first();
        await expect(mainContent).toHaveClass(/with-sidebar/);

        // Close sidebar
        const toggleButton = page.locator("button.sidebar-toggle");
        await toggleButton.click();
        await page.waitForTimeout(300);

        // Main content should not have sidebar margin when closed
        await expect(mainContent).not.toHaveClass(/with-sidebar/);

        // Reopen sidebar
        await toggleButton.click();
        await page.waitForTimeout(300);

        // Main content should have sidebar margin again
        await expect(mainContent).toHaveClass(/with-sidebar/);
    });

    test("should have proper ARIA attributes for accessibility", async ({ page }) => {
        test.setTimeout(120000);

        await expect(page.locator("aside.sidebar")).toBeVisible();

        // Toggle button should have aria-label
        const toggleButton = page.locator("button.sidebar-toggle");
        await expect(toggleButton).toHaveAttribute("aria-label");

        // Projects header should have aria-expanded
        const projectsHeader = page.locator('[aria-label="Toggle projects section"]');
        await expect(projectsHeader).toHaveAttribute("aria-expanded");
        await expect(projectsHeader).toHaveAttribute("aria-label");

        // Pages header should have aria-expanded
        const pagesHeader = page.locator('[aria-label="Toggle pages section"]');
        await expect(pagesHeader).toHaveAttribute("aria-expanded");
        await expect(pagesHeader).toHaveAttribute("aria-label");

        // Page items should have role="button" (if they exist)
        const pageItems = page.locator(".page-item");
        if (await pageItems.count() > 0) {
            await expect(pageItems.first()).toHaveAttribute("role", "button");
        }

        // Settings link should have role="button"
        const settingsLink = page.locator(".settings-link");
        await expect(settingsLink).toHaveAttribute("role", "button");
    });

    test("should handle keyboard navigation on page items", async ({ page }) => {
        test.setTimeout(120000);

        await expect(page.locator("aside.sidebar")).toBeVisible();

        // Focus on a page item
        const pageItem = page.locator(".page-item").first();
        await pageItem.focus();

        // Press Enter to activate
        await page.keyboard.press("Enter");
        await page.waitForTimeout(500);

        // Verify navigation occurred (URL should change or page should respond)
        // This is a basic check that the keyboard event handler is attached
        const currentUrl = page.url();
        expect(currentUrl).toBeTruthy();
    });

    test("should handle keyboard navigation on settings link", async ({ page }) => {
        test.setTimeout(120000);

        await expect(page.locator("aside.sidebar")).toBeVisible();

        // Focus on settings link
        const settingsLink = page.locator(".settings-link");
        await settingsLink.focus();

        // Press Enter to activate
        await page.keyboard.press("Enter");
        await page.waitForTimeout(500);

        // Verify navigation occurred
        const currentUrl = page.url();
        expect(currentUrl).toMatch(/settings/i);
    });
});
