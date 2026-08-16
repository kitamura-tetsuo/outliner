import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

test.describe("Untitled pages", () => {
    test("clearing titles generates Untitled and Untitled_2, and routes correctly", async ({ page }) => {
        // Seed a project with one page
        const { pageName } = await TestHelpers.seedProjectAndNavigate(page, test.info(), ["Line 1"]);

        await TestHelpers.waitForAppReady(page);

        // Wait for URL to be initial page
        await expect(page).toHaveURL(new RegExp(`.*${encodeURIComponent(pageName)}.*`));

        // Click Add New Page in sidebar to create Untitled
        await page.evaluate(() => {
            const btn = document.querySelector('button[aria-label="Add new page"]');
            if (btn) (btn as HTMLElement).click();
        });

        // Wait for URL to update to Untitled
        await expect(page).toHaveURL(/.*Untitled/);

        // Do it again
        await page.evaluate(() => {
            const btn = document.querySelector('button[aria-label="Add new page"]');
            if (btn) (btn as HTMLElement).click();
        });

        // Wait for URL to update to Untitled_2
        await expect(page).toHaveURL(/.*Untitled(_|%20)2/);
    });
});
