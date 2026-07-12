import { expect, test } from "@playwright/test";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
import { TestHelpers } from "../utils/testHelpers";
registerCoverageHooks();

test.describe("Item Voting", () => {
    test("should render vote count and allow toggling votes", async ({ page }, testInfo) => {
        const projectName = `Test Project ${Date.now()}`;
        const pageName = "voting-test";

        await TestHelpers.seedProjectAndNavigate(page, testInfo, [], undefined, {
            projectName,
            pageName,
        });

        // Wait for page to initialize and outliner tree to appear
        await page.waitForSelector(".outliner-item", { state: "visible" });

        // Create an item
        // Hover the page title to show actions
        await page.locator(".outliner-item").first().hover();

        // Fallback: click and press Enter
        await page.locator(".outliner-item").first().click();
        await page.keyboard.press("Enter");
        await page.waitForTimeout(500); // Give it a bit to create item

        // Find all outliner items and verify there are at least 2
        await expect(page.locator(".outliner-item")).toHaveCount(2);

        // Wait for the new item to be created
        await page.keyboard.type("Test item for voting");

        // Ensure actions are visible by hovering over the second item
        const secondItem = page.locator(".outliner-item").nth(1);
        await secondItem.hover();

        // Wait for it to become visible
        const itemActionBtn = secondItem.locator(".vote-btn");

        await expect(itemActionBtn).toBeVisible();

        // Initially no vote count
        await expect(page.locator(".vote-count")).toHaveCount(0);

        // Click vote
        await itemActionBtn.click();
        await page.waitForTimeout(500); // Wait for reactivity

        // Ensure voted class is added
        await expect(itemActionBtn).toHaveClass(/voted/);

        // Wait for vote count badge to appear
        const voteCount = page.locator(".vote-count").first();
        await expect(voteCount).toBeVisible();
        await expect(voteCount).toHaveText("1");
        await expect(secondItem.locator(".vote-count")).toHaveCount(1);

        // Click to remove vote
        await itemActionBtn.click();

        // Ensure voted class is removed
        await expect(itemActionBtn).not.toHaveClass(/voted/);

        // Ensure vote count is removed again (since count is 0, length > 0 condition fails)
        await expect(page.locator(".vote-count")).toHaveCount(0);
    });
});
