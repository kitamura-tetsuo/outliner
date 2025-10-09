/** @feature CMT-0001
 *  Title   : Comment threads per item
 *  Source  : docs/client-features.yaml
 */
import { expect, test } from "@playwright/test";
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
        // インデックス1を使用（インデックス0はページタイトルでコメントボタンが表示されない）
        const firstId = await TestHelpers.getItemIdByIndex(page, 1);
        if (!firstId) throw new Error("item id not found");

        // First, wait for the comment button to be visible and ready
        const commentButton = page.locator(`[data-item-id="${firstId}"] [data-testid="comment-button-${firstId}"]`);
        await expect(commentButton).toBeVisible();

        // Add extra wait to ensure the page is fully loaded and stable
        await page.waitForTimeout(500);

        // Click the comment button
        await commentButton.click();

        // Wait for the comment thread to appear with increased timeout
        // Use a more specific locator to ensure we're waiting for the right thread
        await expect(page.locator(`[data-item-id="${firstId}"] [data-testid="comment-thread"]`)).toBeVisible({
            timeout: 15000,
        });

        await page.fill('[data-testid="new-comment-input"]', "hello");
        const addBtns = page.locator('[data-testid="add-comment-btn"]');
        const addCount = await addBtns.count();
        // eslint-disable-next-line no-console
        console.log("DEBUG add-btn count:", addCount);
        // Try narrowing to the currently visible thread
        const thread = page.locator(`[data-item-id="${firstId}"] [data-testid="comment-thread"]`);
        const addInThread = thread.locator('[data-testid="add-comment-btn"]');
        // eslint-disable-next-line no-console
        console.log("DEBUG add-btn in thread visible:", await addInThread.isVisible());
        await addInThread.click();

        // Wait for comment count to appear and have the correct value
        await expect(
            page.locator(`[data-item-id="${firstId}"] .comment-count`),
        ).toBeVisible();
        await expect(
            page.locator(`[data-item-id="${firstId}"] .comment-count`),
        ).toHaveText("1");

        // Wait for the comment element to appear with specific text, which indicates successful sync
        await expect(page.locator('[data-testid="comment-thread"] .text')).toContainText("hello", { timeout: 15000 });

        // Now verify the comment exists
        const comment = page.locator('[data-testid="comment-thread"] .comment');
        await expect(comment).toHaveCount(1);

        // 編集ボタンをクリック
        await page.click('[data-testid^="comment-"] .edit');

        // 編集入力フィールドが表示されるまで待機
        await expect(page.locator('[data-testid^="edit-input-"]')).toBeVisible();

        // 編集入力フィールドをクリアしてから新しいテキストを入力
        await page.fill('[data-testid^="edit-input-"]', "");
        await page.fill('[data-testid^="edit-input-"]', "edited");

        // 保存ボタンをクリック
        await page.click('[data-testid^="save-edit-"]');

        // 編集モードが終了するまで待機
        await expect(page.locator('[data-testid^="edit-input-"]')).not.toBeVisible();

        // テキストが更新されることを確認
        await expect(comment.locator(".text")).toHaveText("edited");

        await page.click('[data-testid^="comment-"] .delete');
        // Wait for comment count to disappear
        await expect(
            page.locator(`[data-item-id="${firstId}"] .comment-count`),
        ).not.toBeVisible();
    });
});
import "../utils/registerAfterEachSnapshot";
