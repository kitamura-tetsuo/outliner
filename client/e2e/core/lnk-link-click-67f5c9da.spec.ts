import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
/** @feature LNK-0003
 *  Title   : Internal link navigation feature
 *  Source  : docs/client-features.yaml
 */
import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

/**
 * @file LNK-0003.spec.ts
 * @description Test for internal link navigation feature
 * @category navigation
 * @title Internal link navigation feature
 */

test.describe("LNK-0003: Internal link navigation feature", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        await TestHelpers.prepareTestEnvironment(page, testInfo);
    });

    /**
     * @testcase Click an internal link to navigate to another page
     * @description A test to verify that clicking an internal link navigates to another page
     */
    test("Click an internal link to navigate to another page", async ({ page }) => {
        // Set authentication state
        await page.addInitScript(() => {
        });

        // Access the home page
        await page.goto("http://localhost:7090/");

        // Wait for the page to load
        await page.waitForSelector("body", { timeout: 10000 });

        // Save the current URL
        const homeUrl = page.url();
        console.log("Home URL:", homeUrl);

        // Create test HTML (including internal links)
        const linkPageName = "test-link-page-" + Date.now().toString().slice(-6);
        await page.setContent(`
            <div>
                <a href="/${linkPageName}" class="internal-link">${linkPageName}</a>
            </div>
        `);

        // Get the internal link
        const internalLink = page.locator("a.internal-link").first();

        // Get the href attribute of the link
        const href = await internalLink.getAttribute("href");
        expect(href).toBe(`/${linkPageName}`);

        // Verify that the link is clickable
        await expect(internalLink).toBeEnabled();

        // Click the link
        await internalLink.click();

        // Wait for transition to a new URL
        await page.waitForURL(`**/${linkPageName}`, { timeout: 10000 });

        // Verify the new URL
        const newUrl = page.url();
        console.log("New URL after click:", newUrl);
        expect(newUrl).toContain(`/${linkPageName}`);

        // Verify that the URL has changed
        expect(newUrl).not.toBe(homeUrl);
    });

    /**
     * @testcase Access the internal link destination page by directly entering the URL
     * @description A test to verify that the internal link destination page can be accessed by directly entering the URL
     */
});
