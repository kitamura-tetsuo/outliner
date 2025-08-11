import { test, expect } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

test.describe("Comment Thread Emoji Reactions", () => {
    test("reactions sync between two clients", async ({
        browser,
        page: page1,
    }, testInfo) => {
        const page2 = await browser.newPage();

        await TestHelpers.prepareTestEnvironment(page1, testInfo);
        const { projectName, pageName } = await TestHelpers.navigateToTestProjectPage(page1, testInfo, ["Test Page"]);

        const projectUrl = `/${encodeURIComponent(projectName)}/${encodeURIComponent(pageName)}`;

        await page2.goto(page1.url());

        // Add a comment on page 1
        // Click on the first item to show the comment button
        await page1.locator(".outliner-item").first().click();

        // Click the comment button to show the comment thread
        await page1.locator(".comment-button").first().click();

        // Add a comment on page 1
        await page1.getByTestId("new-comment-input").pressSequentially("Test comment");
        await page1.getByTestId("add-comment-btn").click();

        // Wait for the comment to appear on page 2
        await page2.locator(".outliner-item").first().click();
        await page2.locator(".comment-button").first().click();
        await expect(page2.getByText("Test comment")).toBeVisible();

        const comment = page1.locator(".comment").first();
        const commentId = (await comment.getAttribute("data-testid"))?.replace("comment-", "");

        // React to the comment on page 1
        await page1.getByTestId(`reaction-${commentId}-❤️`).click();

        // Check that the reaction appears on page 2
        await expect(page2.getByTestId(`reaction-${commentId}-❤️`)).toHaveText("❤️ 1");

        // React to the comment on page 2
        await page2.getByTestId(`reaction-${commentId}-👍`).click();

        // Check that the reaction appears on page 1
        await expect(page1.getByTestId(`reaction-${commentId}-👍`)).toHaveText("👍 1");

        // Un-react to the comment on page 1
        await page1.getByTestId(`reaction-${commentId}-❤️`).click();

        // Check that the reaction is removed on page 2
        await expect(page2.getByTestId(`reaction-${commentId}-❤️`)).toHaveText("❤️ 0");
    });
});
