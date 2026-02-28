import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
/** @feature LNK-0003
 *  Title   : Internal link navigation feature
 *  Source  : docs/client-features.yaml
 */
import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

test.describe("LNK-0003: Internal link navigation feature", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        await TestHelpers.prepareTestEnvironment(page, testInfo);
    });

    test("Behavior when clicking an internal link to a non-existent page", async ({ page }) => {
        // Generate a non-existent page name
        const nonExistentPageName = "unknown-page-" + Date.now().toString().slice(-6);

        // Create an internal link to a non-existent page in the first item
        const firstItem = page.locator(".outliner-item").first();
        await firstItem.locator(".item-content").click({ force: true });
        await TestHelpers.waitForCursorVisible(page);

        // Input an internal link to a non-existent page
        await page.keyboard.type(`This is a link to [${nonExistentPageName}]`);

        // Press Enter to exit the item (so formatting is applied)
        await page.keyboard.press("Enter");
        await page.waitForTimeout(300);

        // Wait for page reload (wait for Yjs synchronization)
        await page.waitForTimeout(300);

        // Verify that the internal link is generated
        const linkElement = page.locator(`a.internal-link`).filter({ hasText: nonExistentPageName });
        await expect(linkElement).toBeVisible({ timeout: 10000 });

        // Verify the href attribute of the link
        const linkHref = await linkElement.getAttribute("href");
        console.log(`Non-existent page link href: ${linkHref}`);

        const currentUrl = page.url();
        const urlParts = new URL(currentUrl).pathname.split("/").filter(Boolean);
        const projectNameEncoded = urlParts[0];

        expect(linkHref).toBe(`/${projectNameEncoded}/${nonExistentPageName}`);

        // Verify that the link has a class indicating a non-existent page
        const linkClass = await linkElement.getAttribute("class");
        expect(linkClass).toContain("page-not-exists");

        console.log("Non-existent page link test completed successfully");

        await linkElement.click();
        // Move to the non-existent page and verify that a new page is created
        await expect(page).toHaveURL(new RegExp(nonExistentPageName));
        const pageTitle = page.locator(".page-title-content .item-text");
        await expect(pageTitle).toBeVisible({ timeout: 10000 });
        await expect(pageTitle).toContainText(nonExistentPageName);
    });
});
