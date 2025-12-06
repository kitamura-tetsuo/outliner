import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
/**
 * @feature PRJ-0002
 *  Title   : プロジェクトの削除（論理削除）
 *  Source  : docs/client-features.yaml
 */
import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

/**
 * @testcase プロジェクトを削除できる
 * @description プロジェクトを削除してゴミ箱に移動できることを確認するテスト
 * @check プロジェクト設定ページにアクセスできる
 * @check 削除ボタンが表示される
 * @check 削除ボタンをクリックできる
 * @check プロジェクトが削除される
 * @check 削除成功メッセージが表示される
 */
test.describe("プロジェクトの削除（論理削除）", () => {
    let projectTitle: string;

    test.beforeEach(async ({ page }, testInfo) => {
        const result = await TestHelpers.prepareTestEnvironment(page, testInfo, ["First Page", "Second Page"]);
        projectTitle = result.projectName;
    });

    test("プロジェクトを削除できる", async ({ page }) => {
        // プロジェクト設定ページに移動
        await page.goto(`/${projectTitle}/settings`);

        // 設定ページが表示されるまで待機
        await page.waitForSelector("h2", { timeout: 30000 });
        console.log("Settings page loaded");

        // 削除ボタンが表示されることを確認
        const deleteButton = page.locator('[data-testid="delete-project-button"]');
        await expect(deleteButton).toBeVisible();
        console.log("Delete button found");

        // 削除ボタンをクリック
        await deleteButton.click();
        console.log("Clicked delete button");

        // 削除確認ダイアログが表示されることを確認
        const confirmDialog = page.locator('[data-testid="delete-project-dialog"]');
        await expect(confirmDialog).toBeVisible({ timeout: 5000 });
        console.log("Delete confirmation dialog displayed");

        // プロジェクト名を入力して確認
        const confirmInput = page.locator('[data-testid="delete-project-input"]');
        await expect(confirmInput).toBeVisible();
        await confirmInput.fill(projectTitle);
        console.log("Project name entered for confirmation");

        // 確認削除ボタンをクリック
        const confirmDeleteButton = page.locator('[data-testid="confirm-delete-button"]');
        await expect(confirmDeleteButton).toBeEnabled();
        await confirmDeleteButton.click();
        console.log("Clicked confirm delete button");

        // 削除成功メッセージが表示されることを確認
        const successMessage = page.locator('[data-testid="delete-success"]');
        await expect(successMessage).toBeVisible({ timeout: 10000 });
        const successText = await successMessage.textContent();
        console.log("Success message:", successText);
        expect(successText).toContain("削除");

        // アプリケーションがホームページにリダイレクトするのを待つ
        await page.waitForURL("**/", { timeout: 30000 });
        await page.waitForSelector("h1", { timeout: 30000 });

        // 削除したプロジェクトがプロジェクト一覧に表示されないことを確認
        const projectLink = page.locator(`a[href="/${projectTitle}"]`);
        await expect(projectLink).not.toBeVisible({ timeout: 5000 });
        console.log("Deleted project not visible in project list");
    });

    /**
     * @testcase プロジェクト名が一致しない場合は削除できない
     * @description 確認ダイアログでプロジェクト名を入力しない場合のエラーハンドリングを確認
     * @check 削除ボタンをクリックすると確認ダイアログが表示される
     * @check プロジェクト名を入力しないと削除ボタンが無効化される
     * @check 誤操作を防止できる
     */
    test("プロジェクト名が一致しない場合は削除できない", async ({ page }) => {
        // プロジェクト設定ページに移動
        await page.goto(`/${projectTitle}/settings`);

        // 設定ページが表示されるまで待機
        await page.waitForSelector("h2", { timeout: 30000 });

        // 削除ボタンをクリック
        const deleteButton = page.locator('[data-testid="delete-project-button"]');
        await deleteButton.click();

        // 削除確認ダイアログが表示されることを確認
        const confirmDialog = page.locator('[data-testid="delete-project-dialog"]');
        await expect(confirmDialog).toBeVisible({ timeout: 5000 });

        // 誤ったプロジェクト名を入力
        const confirmInput = page.locator('[data-testid="delete-project-input"]');
        await confirmInput.fill("Wrong Project Name");

        // 確認削除ボタンが無効化されていることを確認
        const confirmDeleteButton = page.locator('[data-testid="confirm-delete-button"]');
        await expect(confirmDeleteButton).toBeDisabled();
        console.log("Confirm button is disabled when project name doesn't match");
    });

    /**
     * @testcase 削除されたプロジェクトはアクセスできない
     * @description 削除されたプロジェクトにアクセス尝试的情况を確認
     * @check 削除されたプロジェクトのURLにアクセスしてもプロジェクトビューアが表示されない
     * @check エラーメッセージまたはプロジェクト一覧にリダイレクトされる
     */
    test("削除されたプロジェクトはアクセスできない", async ({ page }) => {
        // まずプロジェクトを削除
        await page.goto(`/${projectTitle}/settings`);
        await page.waitForSelector("h2", { timeout: 30000 });

        const deleteButton = page.locator('[data-testid="delete-project-button"]');
        await deleteButton.click();

        const confirmDialog = page.locator('[data-testid="delete-project-dialog"]');
        await expect(confirmDialog).toBeVisible({ timeout: 5000 });

        const confirmInput = page.locator('[data-testid="delete-project-input"]');
        await confirmInput.fill(projectTitle);

        const confirmDeleteButton = page.locator('[data-testid="confirm-delete-button"]');
        await confirmDeleteButton.click();

        await expect(page.locator('[data-testid="delete-success"]')).toBeVisible({ timeout: 10000 });

        // 削除されたプロジェクトに直接アクセスを試行
        await page.goto(`/${projectTitle}`);

        // エラーメッセージまたはリダイレクトを確認する
        // （実装に応じて調整が必要）
        await page.waitForTimeout(2000);
        const currentUrl = page.url();
        console.log("Current URL after accessing deleted project:", currentUrl);

        // プロジェクト一覧またはエラーメッセージにリダイレクトされることを確認
        expect(currentUrl).not.toContain(`/${projectTitle}`);
        console.log("Redirected away from deleted project");
    });
});
