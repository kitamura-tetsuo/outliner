import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
/** @feature LNK-0003
 *  Title   : Internal Link Navigation
 *  Source  : docs/client-features.yaml
 */
import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

test.describe("LNK-0003: Internal Link Navigation", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        await TestHelpers.prepareTestEnvironment(page, testInfo);
    });

    test("Access an internal link page by entering the URL directly", async ({ page }) => {
        // Set authentication state
        await page.addInitScript(() => {
        });

        // First access the home page
        await page.goto("http://localhost:7090/");

        // Wait for the page to load
        await page.waitForSelector("body", { timeout: 10000 });

        // Check the current URL
        const homeUrl = page.url();
        console.log("Home URL:", homeUrl);

        // Directly access a non-existent page (a new page will be created)
        const randomPage = "page-" + Date.now().toString().slice(-6);

        // Navigate to the page
        await page.goto(`http://localhost:7090/${randomPage}`);

        // Wait for transition to the new URL
        await page.waitForURL(`**/${randomPage}`, { timeout: 10000 });

        // Check the current URL
        const pageUrl = page.url();
        console.log("Page URL:", pageUrl);
        expect(pageUrl).toContain(`/${randomPage}`);

        // Verify that basic page transition is working
        expect(pageUrl).not.toBe(homeUrl);
    });
});
