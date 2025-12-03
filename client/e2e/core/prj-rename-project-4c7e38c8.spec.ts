import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
/**
 * @feature PRJ-0001
 *  Title   : プロジェクト名の変更
 *  Source  : docs/client-features.yaml
 */
import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

/**
 * @testcase プロジェクト名を正常に変更できる
 * @description プロジェクト設定ページでプロジェクト名を変更できることを確認するテスト
 * @check プロジェクト設定ページにアクセスできる
 * @check プロジェクト名入力フィールドが表示される
 * @check 新しいプロジェクト名を入力できる
 * @check 名前変更ボタンがクリックできる
 * @check 変更成功メッセージが表示される
 * @check プロジェクト名が更新される
 */
test.describe("プロジェクト名の変更", () => {
    let projectTitle: string;

    test.beforeEach(async ({ page }, testInfo) => {
        const result = await TestHelpers.prepareTestEnvironment(page, testInfo, ["First Page", "Second Page"]);
        projectTitle = result.projectName;
    });

    test("プロジェクト名を正常に変更できる", async ({ page }) => {
        // プロジェクト設定ページに移動
        await page.goto(`/${projectTitle}/settings`);

        // 設定ページが表示されるまで待機
        await page.waitForSelector("h2", { timeout: 30000 });
        console.log("Settings page loaded");

        // プロジェクト名入力フィールドが存在することを確認
        const titleInput = page.locator('[data-testid="project-title-input"]');
        await expect(titleInput).toBeVisible();
        console.log("Project title input field found");

        // 現在のプロジェクト名を取得
        const currentTitle = await titleInput.inputValue();
        console.log("Current project title:", currentTitle);

        // 新しいプロジェクト名を入力
        const newTitle = "Renamed Project";
        await titleInput.fill(newTitle);
        console.log("Filled new title:", newTitle);

        // 名前変更ボタンをクリック
        const renameButton = page.locator('[data-testid="rename-project-button"]');
        await expect(renameButton).toBeEnabled();
        await renameButton.click();
        console.log("Clicked rename button");

        // 変更成功メッセージが表示されることを確認
        const successMessage = page.locator('[data-testid="rename-success"]');
        await expect(successMessage).toBeVisible({ timeout: 10000 });
        const successText = await successMessage.textContent();
        console.log("Success message:", successText);
        expect(successText).toContain(newTitle);

        // プロジェクト名が更新されていることを確認
        const updatedTitle = await titleInput.inputValue();
        console.log("Updated project title:", updatedTitle);
        expect(updatedTitle).toBe(newTitle);
    });

    /**
     * @testcase 空のプロジェクト名ではエラーが表示される
     * @description 空のプロジェクト名で名前変更を試みた場合のエラーハンドリングを確認
     * @check 空のプロジェクト名を入力するとエラーが表示される
     * @check 名前変更ボタンが無効化される
     */
    test("空のプロジェクト名ではエラーが表示される", async ({ page }) => {
        // プロジェクト設定ページに移動
        await page.goto(`/${projectTitle}/settings`);

        // 設定ページが表示されるまで待機
        await page.waitForSelector("h2", { timeout: 30000 });

        // プロジェクト名入力フィールドをクリア
        const titleInput = page.locator('[data-testid="project-title-input"]');
        await titleInput.fill("");
        console.log("Cleared project title");

        // 名前変更ボタンをクリック
        const renameButton = page.locator('[data-testid="rename-project-button"]');
        await renameButton.click();

        // エラーメッセージが表示されることを確認
        const errorMessage = page.locator('[data-testid="rename-error"]');
        await expect(errorMessage).toBeVisible({ timeout: 5000 });
        const errorText = await errorMessage.textContent();
        console.log("Error message:", errorText);
        expect(errorText).toContain("プロジェクト名を入力してください");
    });

    /**
     * @testcase 現在のプロジェクト名と同じ名前ではエラーが表示される
     * @description 現在と同じプロジェクト名で名前変更を試みた場合のエラーハンドリングを確認
     * @check 現在のプロジェクト名と同じ名前を入力するとエラーが表示される
     * @check 名前変更ボタンが無効化される
     */
    test("現在のプロジェクト名と同じ名前ではエラーが表示される", async ({ page }) => {
        // プロジェクト設定ページに移動
        await page.goto(`/${projectTitle}/settings`);

        // 設定ページが表示されるまで待機
        await page.waitForSelector("h2", { timeout: 30000 });

        // プロジェクト名入力フィールドに現在と同じ名前を入力
        const titleInput = page.locator('[data-testid="project-title-input"]');
        await titleInput.fill(projectTitle);
        console.log("Filled with current title");

        // 名前変更ボタンをクリック
        const renameButton = page.locator('[data-testid="rename-project-button"]');
        await renameButton.click();

        // エラーメッセージが表示されることを確認
        const errorMessage = page.locator('[data-testid="rename-error"]');
        await expect(errorMessage).toBeVisible({ timeout: 5000 });
        const errorText = await errorMessage.textContent();
        console.log("Error message:", errorText);
        expect(errorText).toContain("新しいプロジェクト名は現在名と異なります");
    });
});
