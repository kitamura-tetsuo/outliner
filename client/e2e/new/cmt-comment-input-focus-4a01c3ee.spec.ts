import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
/** @feature CMT-4a01c3ee
 *  Title   : Clicking the comment input focuses it instead of the outline item
 *  Source  : docs/client-features/cmt-comment-threads-1329f927.yaml
 */
import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

/**
 * Regression for https://github.com/kitamura-tetsuo/outliner/issues/3383
 *
 * With an item's editor cursor active, clicking the "Add comment" input and typing
 * must send keystrokes to the comment input, not to the outline item at the
 * previous cursor position.
 */
test.describe("CMT-4a01c3ee: comment input keeps focus while an item cursor is active", () => {
    test.afterEach(async ({ page }) => {
        await page.evaluate(() => {
            const gs: any = (globalThis as any).generalStore;
            if (gs?.currentPage?.items) {
                const items = gs.currentPage.items;
                for (let i = 0; i < (items?.length ?? 0); i++) {
                    const item = items.at(i);
                    if (item && typeof item.getComments === "function") {
                        try {
                            const comments = item.getComments();
                            if (Array.isArray(comments)) {
                                for (const comment of comments) {
                                    if (comment.id && typeof item.deleteComment === "function") {
                                        item.deleteComment(comment.id);
                                    }
                                }
                            }
                        } catch {}
                    }
                }
            }
        }).catch(() => {});
    });

    test("typing in the comment input does not corrupt the item text", async ({ page }, testInfo) => {
        test.setTimeout(60000);
        await TestHelpers.seedProjectAndNavigate(page, testInfo, [
            "first line",
        ]);

        await TestHelpers.waitForOutlinerItems(page);
        const itemId = await TestHelpers.getItemIdByIndex(page, 1);
        if (!itemId) throw new Error("item id not found");

        // Place the editor cursor inside the item first, mirroring the reported steps.
        await page.click(`[data-item-id="${itemId}"] .item-text`);
        await TestHelpers.waitForCursorVisible(page);

        // Open the comment thread for the same item.
        const commentButton = page.locator(`[data-item-id="${itemId}"] [data-testid="comment-button-${itemId}"]`);
        await expect(commentButton).toBeVisible();
        await commentButton.click();

        const input = page.locator(`[data-item-id="${itemId}"] [data-testid="new-comment-input"]`);
        await expect(input).toBeVisible();

        // Click into the comment input; it must actually receive DOM focus.
        await input.click();
        await expect(input).toBeFocused();

        await page.keyboard.type("hello from comment");

        // The keystrokes must land in the comment input, not the outline item.
        await expect(input).toHaveValue("hello from comment");
        await expect(page.locator(`[data-item-id="${itemId}"] .item-text`)).toHaveText("first line");
    });
});
