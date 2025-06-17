import { expect, test } from "@playwright/test";

test.describe("Basic E2E Tests", () => {
    test("should load the homepage", async ({ page }) => {
        console.log("Navigating to homepage...");
        
        // Navigate to the homepage
        await page.goto("/");
        
        console.log("Waiting for page to load...");
        await page.waitForLoadState("domcontentloaded");
        
        console.log("Checking page title...");
        // Check if the page loads (title should contain something)
        const title = await page.title();
        console.log(`Page title: ${title}`);
        expect(title).toBeTruthy();
        
        console.log("Basic homepage test completed successfully");
    });

    test("should have a body element", async ({ page }) => {
        console.log("Navigating to homepage...");
        await page.goto("/");
        
        console.log("Waiting for page to load...");
        await page.waitForLoadState("domcontentloaded");
        
        console.log("Checking for body element...");
        const body = page.locator("body");
        await expect(body).toBeVisible();
        
        console.log("Body element test completed successfully");
    });

    test("should respond to basic interaction", async ({ page }) => {
        console.log("Navigating to homepage...");
        await page.goto("/");
        
        console.log("Waiting for page to load...");
        await page.waitForLoadState("domcontentloaded");
        
        console.log("Checking page content...");
        // Just check that we can interact with the page
        const pageContent = await page.textContent("body");
        expect(pageContent).toBeTruthy();
        
        console.log("Basic interaction test completed successfully");
    });
});
