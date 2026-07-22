import { expect, test } from "@playwright/test";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
import { TestHelpers } from "../utils/testHelpers";
registerCoverageHooks();

test.describe("Intra-project Client-side Navigation", () => {
    test("should handle navigation to existing and non-existent pages within a project", async ({ page }, testInfo) => {
        // Create an empty project and navigate to it first
        const { projectName } = await TestHelpers.seedProjectDataOnly(page, testInfo, []);

        // Navigate to the project page
        await page.goto(`/${encodeURIComponent(projectName)}`);

        // Define initial page
        const initialPage = "PageA";

        // Create PageA
        const pageNameInput = page.locator('input[placeholder="New page name"]');
        await expect(pageNameInput).toBeVisible();
        await pageNameInput.fill(initialPage);
        const createButton = page.locator('button[aria-label="Create new page"]');
        await createButton.click();

        // Ensure we navigate to PageA
        const encodedProjectName = encodeURIComponent(projectName).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const encodedInitialPage = encodeURIComponent(initialPage).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        await expect(page).toHaveURL(new RegExp(`/${encodedProjectName}/${encodedInitialPage}`));

        // Check for PageA title
        await expect(page.locator("h1")).toContainText(initialPage);
        await page.waitForSelector(".outliner", { state: "visible", timeout: 15000 });

        // Go back to the project page first
        await page.goto(`/${encodeURIComponent(projectName)}`);

        // Type a non-existent page name directly in the URL to simulate the routing change
        const pageZUrl = `/${encodeURIComponent(projectName)}/PageZ`;

        // This simulates typing in a non-existent page directly via SvelteKit router
        await page.evaluate(async (url) => {
            // Using SvelteKit's router to navigate to trigger param changes
            const a = document.createElement("a");
            a.href = url;
            a.dataset.sveltekitNoscroll = "";
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
        }, pageZUrl);

        // Verify the "Page not found" state appears
        await expect(page.locator('text="Page not found"')).toBeVisible();
        await expect(page.locator('text="Create Page"')).toBeVisible();

        // Create the non-existent page
        await page.click('button:has-text("Create Page")');

        // Verify the new page outline appears
        await page.waitForSelector(".outliner", { state: "visible", timeout: 15000 });
        await expect(page.locator("h1")).toContainText("PageZ");

        // Navigate client-side back to the first page (PageA) using the same technique
        await page.evaluate(async (url) => {
            const a = document.createElement("a");
            a.href = url;
            a.dataset.sveltekitNoscroll = "";
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
        }, `/${encodeURIComponent(projectName)}/PageA`);

        // Wait for it to load
        await expect(page.locator("h1")).toContainText("PageA");
        await page.waitForSelector(".outliner", { state: "visible", timeout: 15000 });
    });
});
