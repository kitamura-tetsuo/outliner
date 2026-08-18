import { expect, test } from "@playwright/test";
import { registerCoverageHooks } from "../../utils/registerCoverageHooks";
import { TestHelpers } from "../../utils/testHelpers";

registerCoverageHooks();

test.describe("Mobile Toolbar Overlap", () => {
    test.use({ viewport: { width: 375, height: 812 } });

    test(
        "the toolbar's project name overlaps neither the sidebar toggle nor the page content",
        async ({ page }, testInfo) => {
            await TestHelpers.seedProjectAndNavigate(page, testInfo, ["First body line"]);

            await page.waitForSelector(".main-toolbar");

            // Force layout flush and scroll to top just in case
            await page.evaluate(() => {
                (globalThis as any).scrollTo(0, 0);
            });

            // Wait for the CSS variable to be set by the ResizeObserver.
            // We know that on narrow viewports, the toolbar height will be > 5rem (80px),
            // let's wait until the padding-top changes from the default "80px" (5rem)
            await page.waitForFunction(() => {
                const el = document.getElementById("main-content");
                if (!el) return false;
                const pt = parseFloat(getComputedStyle(el).paddingTop);
                return pt > 100;
            });

            const projectLabel = page.getByTestId("toolbar-project-name");
            await expect(projectLabel).toBeVisible({ timeout: 30000 });

            const toolbarBB = await page.locator(".main-toolbar").boundingBox();
            expect(toolbarBB).not.toBeNull();

            // The project label sits clear of the fixed sidebar toggle...
            const toggleBB = await page.locator(".sidebar-toggle").boundingBox();
            const labelBB = await projectLabel.boundingBox();
            expect(toggleBB).not.toBeNull();
            expect(labelBB).not.toBeNull();
            expect(labelBB!.x).toBeGreaterThanOrEqual(toggleBB!.x + toggleBB!.width - 1);

            // ...and stays inside the wrapped toolbar.
            expect(labelBB!.y + labelBB!.height).toBeLessThanOrEqual(toolbarBB!.y + toolbarBB!.height + 1);

            // The toolbar-height variable still keeps the page content below it.
            const actionRow = page.getByTestId("page-toolbar");
            await expect(actionRow).toBeVisible({ timeout: 30000 });
            const actionRowBB = await actionRow.boundingBox();
            expect(actionRowBB).not.toBeNull();
            expect(actionRowBB!.y).toBeGreaterThanOrEqual(toolbarBB!.y + toolbarBB!.height - 1);
        },
    );
});
