import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
/** @feature SRE-002
 *  Title   : Demo Reset Read-Only Feedback
 */
import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

test("demo reset read-only feedback", async ({ page }, testInfo) => {
    await TestHelpers.seedProjectAndNavigate(page, testInfo, ["Line 1"]);

    // Set metadata.isResetting via Y.Doc directly to trigger read-only state
    await page.evaluate(() => {
        const store = (globalThis as any).generalStore;
        const project = store?.project;
        if (project && project.ydoc) {
            project.ydoc.getMap("metadata").set("isResetting", true);
        }
    });

    // Verify the banner is visible
    const banner = page.locator(".reset-banner");
    await expect(banner).toBeVisible({ timeout: 5000 });
    await expect(banner).toHaveText("Demo content is being reset — editing is paused.");
    await expect(banner).toHaveAttribute("role", "status");
    await expect(banner).toHaveAttribute("aria-live", "polite");

    // Clear isResetting flag
    await page.evaluate(() => {
        const store = (globalThis as any).generalStore;
        const project = store?.project;
        if (project && project.ydoc) {
            project.ydoc.getMap("metadata").set("isResetting", false);
        }
    });

    // Verify banner is hidden
    await expect(banner).toBeHidden({ timeout: 5000 });
});
