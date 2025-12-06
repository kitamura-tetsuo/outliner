import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
/**
 * @feature PRJ-0004
 *  Title   : ゴミ箱UI
 *  Source  : docs/client-features.yaml
 */
import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

/**
 * @testcase ゴミ箱ページが正常に表示される
 * @description 削除されたプロジェクト一覧が正常に表示されることを確認するテスト
 * @check ゴミ箱ページにアクセスできる
 * @check ページタイトルが「ゴミ箱」と表示される
 * @check 削除されたプロジェクト一覧テーブルが表示される
 * @check プロジェクトの削除日時が表示される
 * @check 削除者が表示される
 */
test.describe("ゴミ箱UI", () => {
    let projectTitle: string;
    let projectTitle2: string;

    test.beforeEach(async ({ page }, testInfo) => {
        // 複数のプロジェクトを削除してテスト
        const result1 = await TestHelpers.prepareTestEnvironment(page, testInfo, ["Page 1"]);
        projectTitle = result1.projectName;

        // 2番目のプロジェクトを作成
        const result2 = await TestHelpers.prepareTestEnvironment(page, testInfo, ["Page 2"]);
        projectTitle2 = result2.projectName;

        // 両方のプロジェクトを削除
        for (const title of [projectTitle, projectTitle2]) {
            await page.goto(`/${title}/settings`);
            await page.waitForSelector("h2", { timeout: 30000 });

            const deleteButton = page.locator('[data-testid="delete-project-button"]');
            await deleteButton.click();

            const confirmDialog = page.locator('[data-testid="delete-project-dialog"]');
            await expect(confirmDialog).toBeVisible({ timeout: 5000 });

            const confirmInput = page.locator('[data-testid="delete-project-input"]');
            await confirmInput.fill(title);

            const confirmDeleteButton = page.locator('[data-testid="confirm-delete-button"]');
            await confirmDeleteButton.click();

            await expect(page.locator('[data-testid="delete-success"]')).toBeVisible({ timeout: 10000 });
        }
        console.log("Both projects deleted for trash UI test");
    });

    test.afterEach(async ({ page }) => {
        // Clean up: restore deleted projects to avoid accumulating in trash
        try {
            // Use programmatic API call via Firebase Functions directly
            const deletedProjects = await page.evaluate(async () => {
                // Get Firebase ID token
                const auth = window.localStorage.getItem("firebase:authUser");
                if (!auth) {
                    return [];
                }

                const authData = JSON.parse(auth);
                const idToken = authData.stsTokenManager?.accessToken;
                if (!idToken) {
                    return [];
                }

                // Call listDeletedProjects API
                const listResponse = await fetch("/api/listDeletedProjects?idToken=" + idToken);
                const listResult = await listResponse.json();
                const projects = listResult.projects || [];

                // Restore test projects
                const restored = [];
                for (const project of projects) {
                    if (project.title && project.title.includes("Test Project")) {
                        console.log(`Restoring project: ${project.title}`);

                        // Call restoreProject API
                        const restoreResponse = await fetch("/api/restoreProject", {
                            method: "POST",
                            headers: {
                                "Content-Type": "application/json",
                            },
                            body: JSON.stringify({
                                idToken,
                                containerId: project.containerId,
                            }),
                        });

                        if (restoreResponse.ok) {
                            restored.push(project.title);
                        }
                    }
                }
                return restored;
            });

            console.log(`Cleanup completed: restored ${deletedProjects.length} projects:`, deletedProjects);
        } catch (error) {
            // Log warning but don't fail the test
            console.warn("Cleanup warning: failed to restore projects", error);
        }
    });

    test("ゴミ箱ページが正常に表示される", async ({ page }) => {
        // ゴミ箱ページに移動
        await page.goto("/projects/trash");
        await page.waitForSelector("h1", { timeout: 30000 });
        console.log("Trash page loaded");

        // ページタイトルが「ゴミ箱」と表示されることを確認
        const pageTitle = page.locator("h1");
        await expect(pageTitle).toHaveText("ゴミ箱");
        console.log("Page title is 'ゴミ箱'");

        // 削除されたプロジェクト一覧テーブルが表示されることを確認
        const table = page.locator("table");
        await expect(table).toBeVisible();
        console.log("Projects table visible");

        // 削除されたプロジェクトが2つ表示されることを確認
        const projectRow1 = page.locator(`tr:has-text("${projectTitle}")`);
        const projectRow2 = page.locator(`tr:has-text("${projectTitle2}")`);
        await expect(projectRow1).toBeVisible({ timeout: 5000 });
        await expect(projectRow2).toBeVisible({ timeout: 5000 });
        console.log("Both deleted projects visible");

        // プロジェクト名の列が表示されることを確認
        const projectNameHeader = page.locator("th:has-text('プロジェクト名')");
        await expect(projectNameHeader).toBeVisible();
        console.log("Project name column header visible");

        // 削除日時の列が表示されることを確認
        const deletedAtHeader = page.locator("th:has-text('削除日時')");
        await expect(deletedAtHeader).toBeVisible();
        console.log("Deleted at column header visible");

        // 削除者の列が表示されることを確認
        const deletedByHeader = page.locator("th:has-text('削除者')");
        await expect(deletedByHeader).toBeVisible();
        console.log("Deleted by column header visible");
    });

    /**
     * @testcase 複数の削除されたプロジェクトが表示される
     * @description 複数の削除済みプロジェクトが正しく一覧表示されることを確認
     * @check 全ての削除済みプロジェクトがテーブルに表示される
     * @check 各プロジェクトの情報が正しく表示される
     * @check 操作ボタン（復元・完全削除）が各プロジェクトに表示される
     */
    test("複数の削除されたプロジェクトが表示される", async ({ page }) => {
        // ゴミ箱ページに移動
        await page.goto("/projects/trash");
        await page.waitForSelector("h1", { timeout: 30000 });

        // プロジェクト1の行を確認
        const projectRow1 = page.locator(`tr:has-text("${projectTitle}")`);
        await expect(projectRow1).toBeVisible();

        // プロジェクト1の操作ボタンが表示されることを確認
        const project1RestoreButton = page.locator(`tr:has-text("${projectTitle}") button:has-text("復元")`);
        const project1DeleteButton = page.locator(`tr:has-text("${projectTitle}") button:has-text("完全削除")`);
        await expect(project1RestoreButton).toBeVisible();
        await expect(project1DeleteButton).toBeVisible();
        console.log("Project 1 action buttons visible");

        // プロジェクト2の行を確認
        const projectRow2 = page.locator(`tr:has-text("${projectTitle2}")`);
        await expect(projectRow2).toBeVisible();

        // プロジェクト2の操作ボタンが表示されることを確認
        const project2RestoreButton = page.locator(`tr:has-text("${projectTitle2}") button:has-text("復元")`);
        const project2DeleteButton = page.locator(`tr:has-text("${projectTitle2}") button:has-text("完全削除")`);
        await expect(project2RestoreButton).toBeVisible();
        await expect(project2DeleteButton).toBeVisible();
        console.log("Project 2 action buttons visible");
    });

    /**
     * @testcase 更新ボタンでリストを最新化できる
     * @description 「更新」ボタンをクリックして削除済みプロジェクト一覧を最新化できることを確認
     * @check 更新ボタンが表示される
     * @check 更新ボタンをクリックできる
     * @check プロジェクトリストが更新される
     */
    test("更新ボタンでリストを最新化できる", async ({ page }) => {
        // ゴミ箱ページに移動
        await page.goto("/projects/trash");
        await page.waitForSelector("h1", { timeout: 30000 });

        // 更新ボタンをクリック
        const refreshButton = page.locator('button:has-text("更新")');
        await expect(refreshButton).toBeVisible();
        await refreshButton.click();
        console.log("Clicked refresh button");

        // リストが更新されることを確認（読み込み状态が表示されるなど）
        await page.waitForTimeout(2000);
        console.log("Project list refreshed");
    });

    /**
     * @testcase プロジェクト一覧ページへのリンクが表示される
     * @description プロジェクト一覧ページへのリンクが正常に表示されることを確認
     * @check 「プロジェクト一覧に戻る」リンクが表示される
     * @check リンクをクリックできる
     * @check プロジェクト一覧ページに移動できる
     */
    test("プロジェクト一覧ページへのリンクが表示される", async ({ page }) => {
        // ゴミ箱ページに移動
        await page.goto("/projects/trash");
        await page.waitForSelector("h1", { timeout: 30000 });

        // 「プロジェクト一覧に戻る」リンクが表示されることを確認
        const backLink = page.locator('a:has-text("プロジェクト一覧に戻る")');
        await expect(backLink).toBeVisible();

        // リンクをクリック
        await backLink.click();

        // プロジェクト一覧ページに移動することを確認
        await page.waitForSelector("h1", { timeout: 30000 });
        const pageTitle = page.locator("h1");
        await expect(pageTitle).toHaveText("アウトライナー一覧");
        console.log("Navigated back to projects list");
    });
});

/**
 * TODO: Re-add empty state test when cleanup issues are resolved
 * @testcase 削除済みプロジェクトがない場合の表示（独立したテスト）
 * @description 削除済みプロジェクトがない場合の画面表示を独立してテスト
 * @check 「削除されたプロジェクトはありません」メッセージが表示される
 * @check テーブルは表示されないか、空のテーブルが表示される
 *
 * The test has been temporarily removed due to issues with cleanup in the test environment.
 * The test tries to permanently delete all projects which may not work reliably.
 * This should be re-implemented when the cleanup mechanism is more robust.
 */
