import { registerCoverageHooks } from "./utils/registerCoverageHooks";
registerCoverageHooks();
import { expect, test } from "@playwright/test";
import { TestHelpers } from "./utils/testHelpers";

test.describe("Anonymous Access", () => {
    test("should allow anonymous users to view a public project", async ({ page, context }) => {
        const { projectName, pageName } = await TestHelpers.prepareTestEnvironment(page);
        const encodedProject = encodeURIComponent(projectName);
        const encodedPage = encodeURIComponent(pageName);
        await page.goto(`/${encodedProject}/${encodedPage}`);

        // Make the project public and get the URL
        await page.click("#share-button");
        await page.locator("#public-toggle").check();
        const publicUrl = await page.locator("#public-url").inputValue();

        // Log out
        await TestHelpers.logout(page);

        // Open a new incognito window and navigate to the public URL
        const newPage = await context.newPage();
        await newPage.goto(publicUrl);

        // Verify that the project content is visible
        await expect(newPage.locator(".outliner-item")).toHaveCount(1);
        await expect(newPage.locator(".view-only-badge")).toBeVisible();

        // Verify that editing is disabled
        const outlinerItem = newPage.locator(".outliner-item");
        await outlinerItem.click();
        await expect(newPage.locator(".global-textarea")).toBeHidden();
    });

    test("should redirect private projects to the login page for anonymous users", async ({ page, context }) => {
        const { projectName, pageName } = await TestHelpers.prepareTestEnvironment(page);
        const encodedProject = encodeURIComponent(projectName);
        const encodedPage = encodeURIComponent(pageName);

        // Ensure the project is private
        await page.goto(`/${encodedProject}/${encodedPage}`);
        await page.click("#share-button");
        await page.locator("#public-toggle").uncheck();

        // Log out
        await TestHelpers.logout(page);

        // Open a new incognito window and navigate to the project
        const newPage = await context.newPage();
        await newPage.goto(`/${encodedProject}/${encodedPage}`);

        // Verify that the user is redirected to the login page
        await expect(newPage).toHaveURL("/");
    });
});
