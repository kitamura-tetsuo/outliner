import { expect, Page, test } from "@playwright/test";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
import { TestHelpers } from "../utils/testHelpers";

registerCoverageHooks();

const getSidebarHelpers = (page: Page) => {
    const sidebar = page.locator("aside.sidebar");
    const toggleButton = page.locator("button.sidebar-toggle");

    const isOpen = async () => {
        const cls = (await sidebar.getAttribute("class")) ?? "";
        return cls.includes("open");
    };

    const open = async () => {
        if (!(await isOpen())) {
            await toggleButton.click();
            await page.waitForTimeout(200);
            await expect(sidebar).toHaveClass(/open/);
        }
    };

    const close = async () => {
        if (await isOpen()) {
            await toggleButton.click();
            await page.waitForTimeout(200);
            await expect(sidebar).not.toHaveClass(/open/);
        }
    };

    return { sidebar, toggleButton, isOpen, open, close };
};

/**
 * E2E Tests for Sidebar functionality
 * Tests opening/closing sidebar via toggle and navigation links
 */

test.describe("Sidebar Navigation", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        page.on("console", msg => console.log(`[Browser]: ${msg.text()}`));
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

        const { sidebar, toggleButton, open, close, isOpen } = getSidebarHelpers(page);

        // Sidebar starts closed (to avoid covering other UI)
        await expect(sidebar).toBeVisible();
        expect(await isOpen()).toBe(false);

        // Open sidebar
        await open();

        // Close sidebar
        await close();

        // Reopen sidebar
        await open();

        // Final state should be open
        await expect(sidebar).toHaveClass(/open/);
        await expect(toggleButton).toBeVisible();
    });

    test("should toggle Projects section", async ({ page }) => {
        test.setTimeout(120000);

        const { sidebar, open } = getSidebarHelpers(page);
        await open();
        await expect(sidebar).toBeVisible();

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

        const { sidebar, open } = getSidebarHelpers(page);
        await open();
        await expect(sidebar).toBeVisible();

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

        const { sidebar, open } = getSidebarHelpers(page);
        await open();
        await expect(sidebar).toBeVisible();

        // Click on Settings link
        const settingsLink = page.locator(".settings-link");
        await expect(settingsLink).toBeVisible();
        await settingsLink.click();

        // Wait for navigation
        await expect(page).toHaveURL(/settings/i);

        // Verify we're on the settings page or the navigation was attempted
        // Note: This test verifies the click handler works; actual navigation depends on route setup
        const currentUrl = page.url();
        // The URL should contain 'settings' or the navigation should have been attempted
        expect(currentUrl).toMatch(/settings/i);
    });

    test("should show project list in Projects section", async ({ page }) => {
        test.setTimeout(120000);

        const { sidebar, open } = getSidebarHelpers(page);
        await open();
        await expect(sidebar).toBeVisible();

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

        const { sidebar, open } = getSidebarHelpers(page);
        await open();
        await expect(sidebar).toBeVisible();

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

        const { sidebar, open, close } = getSidebarHelpers(page);
        await expect(sidebar).toBeVisible();

        // Main content should not have sidebar margin initially (sidebar closed by default)
        // Use first() to avoid strict mode violation with multiple elements
        const mainContent = page.locator(".main-content").first();
        await expect(mainContent).not.toHaveClass(/with-sidebar/);

        // Open sidebar
        await open();

        // Main content should have sidebar margin when open
        await expect(mainContent).toHaveClass(/with-sidebar/);

        // Close sidebar
        await close();
        await expect(mainContent).not.toHaveClass(/with-sidebar/);

        // Reopen sidebar
        await open();
        await expect(mainContent).toHaveClass(/with-sidebar/);
    });

    test("should have proper ARIA attributes for accessibility", async ({ page }) => {
        test.setTimeout(120000);

        const { sidebar, open } = getSidebarHelpers(page);
        await open();
        await expect(sidebar).toBeVisible();

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

        // Page items should be links (if they exist)
        const pageItems = page.locator(".page-item");
        if (await pageItems.count() > 0) {
            // Check for href attribute instead of role="button"
            await expect(pageItems.first()).toHaveAttribute("href", /.+/);
        }

        // Settings link should be a link
        const settingsLink = page.locator(".settings-link");
        // Check for href attribute instead of role="button"
        await expect(settingsLink).toHaveAttribute("href", /\/settings/);
    });

    test("should handle keyboard navigation on page items", async ({ page }) => {
        test.setTimeout(180000);

        const { sidebar, open } = getSidebarHelpers(page);
        await open();
        await expect(sidebar).toBeVisible();

        // Wait for pages to be loaded in store
        console.log("Waiting for pages in store (60s)...");
        await page.waitForFunction(() => {
            // eslint-disable-next-line no-restricted-globals
            const gs = (window as any).generalStore || (window as any).appStore;
            const count = gs?.pages?.current?.length;
            console.log("[E2E] pages count in store:", count);
            return count > 0;
        }, { timeout: 60000 });
        console.log("Pages found in store.");

        await TestHelpers.waitForPagesList(page, 30000);

        // Give time for DOM to render
        await page.waitForTimeout(1000);

        // Ensure Pages section is expanded
        let pagesHeader = page.locator('[aria-label="Toggle pages section"]');
        if (await pagesHeader.isVisible()) {
            const expanded = await pagesHeader.getAttribute("aria-expanded");
            if (expanded === "false") {
                console.log("Pages section collapsed, expanding...");
                await pagesHeader.click();
                await page.waitForTimeout(500);
            }
        }

        // Wait for page items with extended timeout
        console.log("Waiting for .page-item elements...");
        let pageItemCount = 0;
        for (let attempt = 0; attempt < 10; attempt++) {
            pageItemCount = await page.locator(".page-item").count();
            if (pageItemCount > 0) break;
            console.log(`Attempt ${attempt + 1}: No .page-item found, waiting...`);
            await page.waitForTimeout(1000);

            // Re-check if section needs expansion
            pagesHeader = page.locator('[aria-label="Toggle pages section"]');
            if (await pagesHeader.isVisible()) {
                const exp = await pagesHeader.getAttribute("aria-expanded");
                if (exp === "false") {
                    await pagesHeader.click();
                    await page.waitForTimeout(500);
                }
            }
        }

        if (pageItemCount === 0) {
            // Reload as last resort
            console.log("No .page-item found after retries, reloading...");
            await page.reload();
            await TestHelpers.waitForAppReady(page);

            const { open: reopen } = getSidebarHelpers(page);
            await reopen();

            // Re-expand pages section
            pagesHeader = page.locator('[aria-label="Toggle pages section"]');
            if (await pagesHeader.isVisible()) {
                const expanded = await pagesHeader.getAttribute("aria-expanded");
                if (expanded === "false") {
                    await pagesHeader.click();
                    await page.waitForTimeout(500);
                }
            }

            // Final wait for page items
            await expect(page.locator(".page-item").first()).toBeVisible({ timeout: 30000 });
        }

        console.log(`Found ${await page.locator(".page-item").count()} .page-item elements`);

        const pageItem = page.locator(".page-item").first();
        await pageItem.waitFor({ state: "visible", timeout: 10000 });
        console.log("Focusing page item...");
        await pageItem.focus();

        const currentUrl = page.url();
        console.log(`Current URL: ${currentUrl}`);
        // Press Enter to activate
        console.log("Pressing Enter...");
        await page.keyboard.press("Enter");

        // Wait for navigation to occur (URL change)
        console.log("Waiting for URL change...");
        await expect.poll(() => page.url(), { timeout: 30000 }).not.toBe(currentUrl);
        expect(page.url()).toBeTruthy();
    });

    test("should handle keyboard navigation on settings link", async ({ page }) => {
        test.setTimeout(120000);

        const { sidebar, open } = getSidebarHelpers(page);
        await open();
        await expect(sidebar).toBeVisible();

        // Focus on settings link
        const settingsLink = page.locator(".settings-link");
        await settingsLink.focus();

        // Press Enter to activate
        await page.keyboard.press("Enter");
        await expect(page).toHaveURL(/settings/i);

        // Verify navigation occurred
        const currentUrl = page.url();
        expect(currentUrl).toMatch(/settings/i);
    });
});
