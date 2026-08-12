import { expect, test } from "@playwright/test";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
import { TestHelpers } from "../utils/testHelpers";

registerCoverageHooks();

test.describe("Item Voting", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        const seedLines = ["Item to vote on"];
        const { projectName, pageName } = await TestHelpers.seedProjectDataOnly(page, testInfo, seedLines);
        await TestHelpers.navigateToProjectPage(page, projectName, pageName, seedLines);
    });

    test("should render vote count and allow toggling votes via context menu", async ({ page }) => {
        // Focus the editor to ensure we can see action buttons on hover/focus if needed
        await page.locator(".global-textarea").focus();

        const items = page.locator(".outliner-item");

        // We know from test data that the 2nd item is the non-title item.
        const secondItem = items.nth(1);

        // Right click to open context menu
        await secondItem.click({ button: "right" });

        const contextMenu = page.locator(".context-menu");
        await expect(contextMenu).toBeVisible();

        const voteBtn = contextMenu.locator("button", { hasText: "Vote for item" });
        await expect(voteBtn).toBeVisible();

        // Initially no vote count
        await expect(page.locator(".vote-count")).toHaveCount(0);

        // Click the vote button
        await voteBtn.click();

        // Menu should close
        await expect(contextMenu).not.toBeVisible();

        // Vote count should now be 1
        const voteCountBadge = page.locator(".vote-count");
        await expect(voteCountBadge).toBeVisible();
        // Since the accessible name is also rendered as inner text in the DOM via .sr-only,
        // we assert specifically on the visible span.
        await expect(voteCountBadge.locator('span[aria-hidden="true"]')).toHaveText("1");

        // Verify vote button state reflects voted status
        await secondItem.click({ button: "right" });
        const removeVoteBtn = contextMenu.locator("button", { hasText: "Remove vote" });
        await expect(removeVoteBtn).toBeVisible();

        // Click again to unvote
        await removeVoteBtn.click();

        // Menu should close
        await expect(contextMenu).not.toBeVisible();

        // Vote count should be removed
        await expect(page.locator(".vote-count")).toHaveCount(0);
    });
});
