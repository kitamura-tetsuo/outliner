/** @feature CMT-0001
 *  Title   : Comment threads per item
 *  Source  : docs/client-features.yaml
 */
import { expect, test } from "@playwright/test";
import { DataValidationHelpers } from "../utils/dataValidationHelpers";
import { TestHelpers } from "../utils/testHelpers";

let projectName: string;
let pageName: string;

test.describe("CMT-0001: comment threads", () => {
    test.afterEach(async ({ page }) => {
        // FluidとYjsのデータ整合性を確認
        await DataValidationHelpers.validateDataConsistency(page);
    });
    test.beforeEach(async ({ page }, testInfo) => {
        const ids = await TestHelpers.prepareTestEnvironment(page, testInfo, [
            "first line",
            "second line",
            "third line",
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
        await page.click(
            `[data-item-id="${firstId}"] [data-testid="comment-button-${firstId}"]`,
        );

        // コメントスレッドが表示されるまで待機
        await expect(page.locator('[data-testid="comment-thread"]')).toBeVisible();
        await page.fill('[data-testid="new-comment-input"]', "hello");
        await page.click('[data-testid="add-comment-btn"]');

        // コメント追加後、DOM更新を待機
        await page.waitForTimeout(500);

        // デバッグ: コメント追加後の状態を確認
        const commentCountElement = page.locator(`[data-item-id="${firstId}"] .comment-count`);
        const commentCountExists = await commentCountElement.count();
        console.log(`Comment count element exists: ${commentCountExists}`);

        if (commentCountExists === 0) {
            // コメントカウント要素が存在しない場合、アイテム全体の状態を確認
            const itemElement = page.locator(`[data-item-id="${firstId}"]`);
            const itemHTML = await itemElement.innerHTML();
            console.log(`Item HTML: ${itemHTML}`);
        }

        await expect(
            page.locator(`[data-item-id="${firstId}"] .comment-count`),
        ).toHaveText("1");
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
        await expect(
            page.locator(`[data-item-id="${firstId}"] .comment-count`),
        ).toHaveCount(0);

        // データ一致チェック
        await DataValidationHelpers.validateDataConsistency(page);
    });
});
