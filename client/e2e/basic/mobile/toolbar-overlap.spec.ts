import { expect, test } from "@playwright/test";
import { registerCoverageHooks } from "../../utils/registerCoverageHooks";
import { TestHelpers } from "../../utils/testHelpers";

registerCoverageHooks();

test.describe("Mobile Toolbar Overlap", () => {
    test.use({ viewport: { width: 375, height: 812 } });

    test("breadcrumb should be visible below the toolbar", async ({ page }) => {
        // Seed and navigate to a project to ensure breadcrumbs are present
        await TestHelpers.seedProjectAndNavigate(page, "demo");

        // Wait for the layout to settle
        await page.waitForSelector(".main-toolbar");

        // Force layout flush and scroll to top just in case
        await page.evaluate(() => {
            (globalThis as any).scrollTo(0, 0);
        });

        // Wait for the CSS variable to be set by the ResizeObserver.
        // We know that on narrow viewports, the toolbar height will be > 5rem (80px),
        // let's wait until the padding-top changes from the default "80px" (5rem)
        // Note: the component might take a moment to update the padding top
        await page.waitForFunction(() => {
            const el = document.getElementById("main-content");
            if (!el) return false;
            // Get computed padding-top
            const ptStr = getComputedStyle(el).paddingTop;
            const pt = parseFloat(ptStr);
            // Wait for it to be substantially larger than the default 5rem=80px
            return pt > 100;
        });

        const breadcrumb = page.locator('nav[aria-label="Breadcrumb"]').first();
        await breadcrumb.waitFor({ state: "visible" });

        const toolbarBB = await page.locator(".main-toolbar").boundingBox();
        expect(toolbarBB).not.toBeNull();

        // Check if the first breadcrumb is below the toolbar bottom
        const breadcrumbBB = await breadcrumb.boundingBox();
        expect(breadcrumbBB).not.toBeNull();

        console.log(`Viewport Width: 375`);
        console.log(`Toolbar bottom: ${toolbarBB!.y + toolbarBB!.height}`);
        console.log(`Breadcrumb top: ${breadcrumbBB?.y}`);

        // Check main-content padding-top actually updates to toolbar height
        const mainContent = page.locator("#main-content");
        const paddingTop = await mainContent.evaluate(el => parseFloat(getComputedStyle(el).paddingTop));

        console.log(`Main content padding-top: ${paddingTop}`);
        console.log(`Toolbar height: ${toolbarBB!.height}`);

        // Wait for the layout to reflect the change
        // We know the overlap happens when Toolbar gets taller
        // Sometimes padding doesn't update exactly to the pixel right away if there are other layout shifts
        // We'll assert that the breadcrumb top is greater than the toolbar bottom
        expect(breadcrumbBB!.y).toBeGreaterThanOrEqual(toolbarBB!.y + toolbarBB!.height - 1);
    });
});
