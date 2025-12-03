import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
/**
 * @feature PRJ-0003
 *  Title   : プロジェクトの復元
 *  Source  : docs/client-features.yaml
 */
import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

/**
 * @testcase 削除されたプロジェクトを復元できる
 * @description ゴミ箱からプロジェクトを復元できることを確認するテスト
 * @check ゴミ箱ページにアクセスできる
 * @check 削除されたプロジェクトが表示される
 * @check 復元ボタンがクリックできる
 * @check プロジェクトが復元される
 * @check 復元成功メッセージが表示される
 */
test.describe("プロジェクトの復元", () => {
    let projectTitle: string;

    test.beforeEach(async ({ page }, testInfo) => {
        const result = await TestHelpers.prepareTestEnvironment(page, testInfo, ["First Page", "Second Page"]);
        projectTitle = result.projectName;

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
        console.log("Project deleted for restore test");
    });

    test("削除されたプロジェクトを復元できる", async ({ page }) => {
        // ゴミ箱ページに移動
        await page.goto("/projects/trash");
        await page.waitForSelector("h1", { timeout: 30000 });
        console.log("Trash page loaded");

        // 削除されたプロジェクトが表示されることを確認
        const deletedProjectRow = page.locator(`tr:has-text("${projectTitle}")`);
        await expect(deletedProjectRow).toBeVisible({ timeout: 10000 });
        console.log("Deleted project visible in trash");

        // 復元ボタンをクリック
        const restoreButton = page.locator(`tr:has-text("${projectTitle}") button:has-text("復元")`);
        await expect(restoreButton).toBeVisible();
        await restoreButton.click();
        console.log("Clicked restore button");

        // 復元成功メッセージが表示されることを確認
        const successMessage = page.locator('[data-testid="restore-success"]');
        await expect(successMessage).toBeVisible({ timeout: 10000 });
        const successText = await successMessage.textContent();
        console.log("Success message:", successText);
        expect(successText).toContain("復元");

        // プロジェクトがゴミ箱から消えることを確認
        await page.waitForTimeout(2000);
        await expect(deletedProjectRow).not.toBeVisible({ timeout: 5000 });
        console.log("Project removed from trash");

        // プロジェクト一覧ページに移動
        await page.goto("/projects");
        await page.waitForSelector("h1", { timeout: 30000 });

        // 復元したプロジェクトがプロジェクト一覧に表示されることを確認
        const projectLink = page.locator(`a[href="/${projectTitle}"]`);
        await expect(projectLink).toBeVisible({ timeout: 5000 });
        console.log("Restored project visible in project list");
    });

    /**
     * @testcase 復元したプロジェクトにアクセスできる
     * @description 復元されたプロジェクトに正常にアクセスできることを確認
     * @check 復元したプロジェクトのURLにアクセスできる
     * @check プロジェクトビューアが正常に表示される
     * @check プロジェクトコンテンツが参照できる
     */
    test("復元したプロジェクトにアクセスできる", async ({ page }) => {
        // まずプロジェクトを復元
        await page.goto("/projects/trash");
        await page.waitForSelector("h1", { timeout: 30000 });

        const restoreButton = page.locator(`tr:has-text("${projectTitle}") button:has-text("復元")`);
        await restoreButton.click();

        await expect(page.locator('[data-testid="restore-success"]')).toBeVisible({ timeout: 10000 });

        // 復元したプロジェクトに直接アクセス
        await page.goto(`/${projectTitle}`);
        await page.waitForSelector('[data-testid="project-viewer"]', { timeout: 30000 });
        console.log("Project viewer loaded");

        // プロジェクトコンテンツが表示されることを確認
        const firstPage = page.locator("text=First Page");
        await expect(firstPage).toBeVisible({ timeout: 5000 });
        console.log("Project content accessible");
    });

    /**
     * @testcase 復元後にプロジェクト名を更新できる
     * @description 復元されたプロジェクトの名前を変更できることを確認
     * @check 復元したプロジェクトの設定ページにアクセスできる
     * @check プロジェクト名を更新できる
     * @check 名前の更新が反映される
     */
    test("復元後にプロジェクト名を更新できる", async ({ page }) => {
        // まずプロジェクトを復元
        await page.goto("/projects/trash");
        await page.waitForSelector("h1", { timeout: 30000 });

        const restoreButton = page.locator(`tr:has-text("${projectTitle}") button:has-text("復元")`);
        await restoreButton.click();

        await expect(page.locator('[data-testid="restore-success"]')).toBeVisible({ timeout: 10000 });

        // プロジェクト設定ページに移動
        await page.goto(`/${projectTitle}/settings`);
        await page.waitForSelector("h2", { timeout: 30000 });
        console.log("Settings page loaded");

        // プロジェクト名入力フィールドが存在することを確認
        const titleInput = page.locator('[data-testid="project-title-input"]');
        await expect(titleInput).toBeVisible();

        // 新しいプロジェクト名を入力
        const newTitle = "Restored Project";
        await titleInput.fill(newTitle);

        // 名前変更ボタンをクリック
        const renameButton = page.locator('[data-testid="rename-project-button"]');
        await renameButton.click();

        // 変更成功メッセージが表示されることを確認
        const successMessage = page.locator('[data-testid="rename-success"]');
        await expect(successMessage).toBeVisible({ timeout: 10000 });
        console.log("Project renamed after restore");
    });
});
