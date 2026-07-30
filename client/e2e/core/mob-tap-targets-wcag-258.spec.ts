import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

test.describe("Mobile Viewport", () => {
    // Setup for mobile viewport
    test.use({ viewport: { width: 375, height: 812 } });

    test("All interactive controls should meet the WCAG 2.2 SC 2.5.8 minimum target size of 24x24", async ({ page }) => {
        // Log in and go to a page to test OutlinerItems, DatabaseSidebar, and Breadcrumbs.
        const testInfo = test.info();

        await TestHelpers.seedProjectAndNavigate(page, testInfo, ["Item 1"]);
        await TestHelpers.waitForOutlinerItems(page, 1);

        // Ensure Database Sidebar is visible, if needed or Breadcrumbs.

        // Get all button and a tags
        const smallTargets = await page.evaluate(() => {
            return [...document.querySelectorAll("button,a")]
                .map(e => {
                    const r = e.getBoundingClientRect();
                    return {
                        label: (e.getAttribute("aria-label") || e.textContent || "").trim().slice(0, 30),
                        width: r.width,
                        height: r.height,
                        visible: r.width > 0 && r.height > 0,
                    };
                })
                .filter(o => o.visible && (o.width < 24 || o.height < 24));
        });

        expect(smallTargets).toEqual([]);
    });
});
