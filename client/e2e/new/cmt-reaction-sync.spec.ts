import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

test.describe("Comment reaction sync", () => {
    let page1: any, page2: any;
    let testHelpers1: TestHelpers, testHelpers2: TestHelpers;

    test.beforeEach(async ({ browser }) => {
        const context1 = await browser.newContext();
        const context2 = await browser.newContext();
        page1 = await context1.newPage();
        page2 = await context2.newPage();
        testHelpers1 = new TestHelpers(page1);
        testHelpers2 = new TestHelpers(page2);
    });

    test("reactions are synced between two clients", async () => {
        await testHelpers1.prepareTestEnvironment();
        const projectUrl = await testHelpers1.createProject();
        await page2.goto(projectUrl);
        await testHelpers2.waitForProjectLoad();

        // Add a comment on page 1
        await page1.getByTestId("new-comment-input").fill("Test comment");
        await page1.getByTestId("add-comment-btn").click();

        // Verify comment appears on page 2
        await expect(page2.getByText("Test comment")).toBeVisible();

        const commentId = await page1.locator(".comment").first().getAttribute("data-testid");

        // Add a reaction on page 1
        await page1.locator(`[data-testid="${commentId}"] .reaction`).first().click();

        // Verify reaction appears on page 2
        await expect(page2.locator(`[data-testid="${commentId}"] .reaction .count`).first()).toHaveText("1");

        // Add a reaction on page 2
        await page2.locator(`[data-testid="${commentId}"] .reaction`).first().click();

        // Verify reaction count is updated on page 1
        await expect(page1.locator(`[data-testid="${commentId}"] .reaction .count`).first()).toHaveText("0");
    });
});
