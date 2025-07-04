/** @feature CMT-0001
 *  Title   : Comment threads per item
 *  Source  : docs/client-features.yaml
 */
import {
    expect,
    test,
} from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

let projectName: string;
let pageName: string;

test.describe("CMT-0001: comment threads", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        const ids = await TestHelpers.prepareTestEnvironment(page, testInfo, [
            "first line",
        ]);
        projectName = ids.projectName;
        pageName = ids.pageName;
    });

    test("add, edit and remove comment", async ({ page }) => {
        await page.goto(`/${projectName}/${pageName}`);
        await TestHelpers.waitForOutlinerItems(page);
        const firstId = await TestHelpers.getItemIdByIndex(page, 0);
        if (!firstId) throw new Error("item id not found");
        await page.click(
            `[data-item-id="${firstId}"] [data-testid="comment-button-${firstId}"]`,
        );
        await page.fill('[data-testid="new-comment-input"]', "hello");
        await page.click('[data-testid="add-comment-btn"]');
        await expect(
            page.locator(`[data-item-id="${firstId}"] .comment-count`),
        ).toHaveText("1");
        const comment = page.locator('[data-testid="comment-thread"] .comment');
        await expect(comment).toHaveCount(1);
        await page.click('[data-testid^="comment-"] .edit');
        await page.fill('[data-testid^="edit-input-"]', "edited");
        await page.click('[data-testid^="save-edit-"]');
        await expect(comment.locator(".text")).toHaveText("edited");
        await page.click('[data-testid^="comment-"] .delete');
        await expect(
            page.locator(`[data-item-id="${firstId}"] .comment-count`),
        ).toHaveCount(0);
    });
});
