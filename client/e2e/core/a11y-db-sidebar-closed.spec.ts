import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";
import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();

test.describe("Database Sidebar Accessibility", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        test.setTimeout(120000);
        await TestHelpers.seedProjectAndNavigate(page, testInfo, ["Database table demo item"]);
    });

    test("closed Database Sidebar should not have focusable elements", async ({ page }) => {
        // Wait for toolbar and database sidebar button
        const dbSidebarButton = page.locator('button[aria-label="Toggle Databases Sidebar"]');
        await expect(dbSidebarButton).toBeVisible({ timeout: 10000 });

        // Wait for the sidebar to be in the DOM
        const sidebar = page.locator('aside.sidebar[aria-label="Database Sidebar"]');
        await expect(sidebar).toBeAttached();

        // Make sure it is closed
        await expect(sidebar).not.toHaveClass(/open/);

        // Verify inert and aria-hidden
        await expect(sidebar).toHaveAttribute("inert", "");
        await expect(sidebar).toHaveAttribute("aria-hidden", "true");

        // Verify no focusable elements inside
        const focusableElements = await sidebar.locator(
            'a, button, input, textarea, select, details, [tabindex]:not([tabindex="-1"])',
        ).count();
        // Elements still exist in the DOM, so count() will be > 0.
        expect(focusableElements).toBeGreaterThan(0);

        // However, they should not be focusable because the parent is inert
        const canFocus = await sidebar.evaluate((sidebarNode) => {
            const btn = sidebarNode.querySelector("button");
            btn.focus();
            return document.activeElement === btn;
        });
        expect(canFocus).toBe(false);

        // Now open it
        await dbSidebarButton.click();
        await expect(sidebar).toHaveClass(/open/);
        await expect(sidebar).not.toHaveAttribute("inert");
        await expect(sidebar).not.toHaveAttribute("aria-hidden", "true");

        // Focus should be manageable now
        const canFocusOpen = await sidebar.evaluate((sidebarNode) => {
            const btn = sidebarNode.querySelector("button");
            if (btn) {
                btn.focus();
                return document.activeElement === btn;
            }
            return false;
        });
        expect(canFocusOpen).toBe(true);

        // Now close it using the close button and check focus is returned to Toggle button
        const closeBtn = sidebar.locator("button.close-btn");
        await closeBtn.click();

        await expect(sidebar).not.toHaveClass(/open/);

        // Wait a bit to ensure focus returns
        await expect(dbSidebarButton).toBeFocused();
    });
});
