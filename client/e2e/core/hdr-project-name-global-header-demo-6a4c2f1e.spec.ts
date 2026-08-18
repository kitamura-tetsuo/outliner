import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
/** @feature HDR-6a4c2f1e
 *  Title   : Project name in the global header
 *  Source  : docs/client-features.yaml
 */
import { expect, test } from "@playwright/test";

test.describe("HDR-6a4c2f1e: Project name in the global header (demo pages)", () => {
    test("a demo page view names its project in the toolbar, not above the editor", async ({ page }) => {
        await page.goto("/demo/Formatting");

        const projectLabel = page.getByTestId("toolbar-project-name");
        await expect(projectLabel).toBeVisible({ timeout: 30000 });
        // The demo's canonical title is its slug, so the header names the
        // locale a visitor is actually in.
        await expect(projectLabel).toHaveText("demo");

        await expect(page.locator('nav[aria-label="Breadcrumb"]')).toHaveCount(0);
        await expect(page.locator('nav a:has-text("Home")')).toHaveCount(0);
        await expect(page.locator("main h1")).toHaveCount(0);

        const titleItem = page.locator(".outliner-item.page-title[data-item-id]").first();
        await expect(titleItem).toBeVisible({ timeout: 30000 });
        await expect(titleItem).toContainText("Formatting");
    });

    test("demo controls and the state message survive the cleanup", async ({ page }) => {
        await page.goto("/demo/Formatting");

        const actions = page.getByTestId("demo-page-toolbar");
        await expect(actions).toBeVisible({ timeout: 30000 });
        await expect(page.getByTestId("search-toggle-button")).toBeVisible();
        await expect(page.getByTestId("graph-view-button")).toBeVisible();

        // Conveys state rather than identity, so it stays.
        await expect(
            page.getByText("This is a public, collaborative demo space.", { exact: false }),
        ).toBeVisible({ timeout: 15000 });
    });

    test("the Japanese demo shows its own slug in the header", async ({ page }) => {
        await page.goto("/demo-ja");

        const projectLabel = page.getByTestId("toolbar-project-name");
        await expect(projectLabel).toBeVisible({ timeout: 30000 });
        // Switching projects must not leave the previous project's name behind.
        await expect(projectLabel).toHaveText("demo-ja");
    });
});
