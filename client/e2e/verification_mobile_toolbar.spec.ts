import { expect, test } from "@playwright/test";

test("Mobile action toolbar should be visible", async ({ page }) => {
    // Use a mobile viewport size to ensure the mobile toolbar is rendered
    await page.setViewportSize({ width: 375, height: 667 });

    // Navigate to a page. We need to create a project/page first or use a known one.
    // Assuming the app has a way to create a temporary page or we can land on the home page.
    // For verification purposes, we'll try to land on a page that renders the OutlinerTree.
    // The default route '/' might redirect or show the home page.
    // Let's try to simulate a user creating a quick page or navigating to one.

    await page.goto("http://localhost:5173/");

    // Wait for the page to load.
    // If we are on the home page, we might need to click "New Project" or similar.
    // Based on previous file reads, there is a "New Project" button.

    // Try to find a button to create a new project/page if not immediately available.
    const newProjectBtn = page.getByText("New Project");
    if (await newProjectBtn.isVisible()) {
        await newProjectBtn.click();
        // Wait for navigation
        await page.waitForURL("**/*");
    }

    // Wait for the OutlinerTree to be visible.
    // The mobile toolbar has the class .mobile-action-toolbar and data-testid="mobile-action-toolbar"
    const toolbar = page.getByTestId("mobile-action-toolbar");

    // It should be visible on mobile
    await expect(toolbar).toBeVisible();

    // We can also check if the bottom style is applied (initially 0)
    await expect(toolbar).toHaveCSS("bottom", "0px");

    // Take a screenshot
    await page.screenshot({ path: "verification.png" });
});
