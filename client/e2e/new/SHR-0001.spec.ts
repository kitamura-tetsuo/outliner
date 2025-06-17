/** @feature SHR-0001
 * プロジェクト共有テスト
 */
import {
    expect,
    test,
} from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

test.describe("SHR-0001: プロジェクト共有テスト", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        await TestHelpers.prepareTestEnvironment(page, testInfo, [], false, true);
    });

    test("project can be created and shared", async ({ page }) => {
        // プロジェクト作成ページに移動
        await page.goto("/", { waitUntil: "domcontentloaded" });

        // 新しいプロジェクトを作成
        await page.click('[data-testid="create-project-button"]');
        await page.fill('[data-testid="project-name-input"]', "Test Shared Project");
        await page.click('[data-testid="create-button"]');

        // プロジェクトが作成されることを確認
        await expect(page.locator('[data-testid="project-title"]')).toContainText("Test Shared Project");

        // 共有ボタンをクリック
        await page.click('[data-testid="share-project-button"]');

        // 共有ダイアログが表示されることを確認
        await expect(page.locator('[data-testid="share-dialog"]')).toBeVisible();
    });

    test("share link can be generated", async ({ page }) => {
        // 既存のプロジェクトに移動
        await page.goto("/test-project", { waitUntil: "domcontentloaded" });

        // テストモードを再設定
        await page.evaluate(() => {
            (window as any).__TEST_MODE__ = true;
        });

        // ページが読み込まれるまで少し待つ
        await page.waitForTimeout(2000);

        // ページの状態をデバッグ
        const pageStatus = await page.evaluate(() => {
            const projectTitleElement = document.querySelector('[data-testid="project-title"]');
            const shareButtonElement = document.querySelector('[data-testid="share-project-button"]');

            return {
                url: window.location.href,
                hasProjectTitle: !!projectTitleElement,
                hasShareButton: !!shareButtonElement,
                projectName: projectTitleElement?.textContent?.trim() || null,
                shareButtonVisible: shareButtonElement?.offsetParent !== null,
                testMode: (window as any).__TEST_MODE__,
                h1Elements: Array.from(document.querySelectorAll("h1")).map(h => ({
                    text: h.textContent?.trim(),
                    testId: h.getAttribute("data-testid"),
                })),
            };
        });

        console.log("Page status in test:", pageStatus);

        // 共有ボタンをクリック
        await page.click('[data-testid="share-project-button"]');

        // 共有リンク生成ボタンをクリック
        await page.click('[data-testid="generate-share-link-button"]');

        // 共有リンクが生成されることを確認
        await expect(page.locator('[data-testid="share-link-input"]')).toBeVisible();

        const shareLink = await page.inputValue('[data-testid="share-link-input"]');
        expect(shareLink).toMatch(/^https?:\/\/.+\/shared\/.+$/);
    });

    test("share permissions can be configured", async ({ page }) => {
        await page.goto("/test-project", { waitUntil: "domcontentloaded" });

        // 共有設定を開く
        await page.click('[data-testid="share-project-button"]');

        // 権限設定セクションが表示されることを確認
        await expect(page.locator('[data-testid="permission-settings"]')).toBeVisible();

        // 読み取り専用権限を設定
        await page.click('[data-testid="permission-readonly"]');

        // 編集権限を設定
        await page.click('[data-testid="permission-edit"]');

        // 管理者権限を設定
        await page.click('[data-testid="permission-admin"]');

        // 設定が保存されることを確認
        await page.click('[data-testid="save-permissions-button"]');
        await expect(page.locator('[data-testid="permissions-saved-message"]')).toBeVisible();
    });

    test("shared project can be accessed via link", async ({ page, context }) => {
        // 共有リンクを生成
        await page.goto("/test-project", { waitUntil: "domcontentloaded" });
        await page.click('[data-testid="share-project-button"]');
        await page.click('[data-testid="generate-share-link-button"]');

        const shareLink = await page.inputValue('[data-testid="share-link-input"]');

        // 新しいページで共有リンクにアクセス
        const newPage = await context.newPage();
        await newPage.goto(shareLink, { waitUntil: "domcontentloaded" });

        // 共有プロジェクトが表示されることを確認
        await expect(newPage.locator('[data-testid="shared-project-indicator"]')).toBeVisible();
        await expect(newPage.locator('[data-testid="project-content"]')).toBeVisible();
    });

    test("share access can be revoked", async ({ page }) => {
        await page.goto("/test-project", { waitUntil: "domcontentloaded" });

        // 共有設定を開く
        await page.click('[data-testid="share-project-button"]');

        // 共有リンクを生成
        await page.click('[data-testid="generate-share-link-button"]');

        // アクセスを取り消し
        await page.click('[data-testid="revoke-access-button"]');

        // 確認ダイアログで取り消しを確定
        await page.click('[data-testid="confirm-revoke-button"]');

        // アクセスが取り消されたことを確認
        await expect(page.locator('[data-testid="access-revoked-message"]')).toBeVisible();
    });

    test("user can be invited to project", async ({ page }) => {
        await page.goto("/test-project", { waitUntil: "domcontentloaded" });

        // 共有設定を開く
        await page.click('[data-testid="share-project-button"]');

        // ユーザー招待セクションに移動
        await page.click('[data-testid="invite-users-tab"]');

        // ユーザーのメールアドレスを入力
        await page.fill('[data-testid="invite-email-input"]', "test@example.com");

        // 権限を選択
        await page.selectOption('[data-testid="invite-permission-select"]', "edit");

        // 招待を送信
        await page.click('[data-testid="send-invite-button"]');

        // 招待が送信されたことを確認
        await expect(page.locator('[data-testid="invite-sent-message"]')).toBeVisible();
    });

    test("project sharing history is tracked", async ({ page }) => {
        await page.goto("/test-project", { waitUntil: "domcontentloaded" });

        // 共有設定を開く
        await page.click('[data-testid="share-project-button"]');

        // 共有履歴タブに移動
        await page.click('[data-testid="sharing-history-tab"]');

        // 共有履歴が表示されることを確認
        await expect(page.locator('[data-testid="sharing-history-list"]')).toBeVisible();

        // 履歴エントリが存在することを確認
        const historyItems = page.locator('[data-testid="history-item"]');
        await expect(historyItems).toHaveCountGreaterThan(0);
    });

    test("shared project shows correct permissions", async ({ page, context }) => {
        // 読み取り専用権限で共有リンクを作成
        await page.goto("/test-project", { waitUntil: "domcontentloaded" });
        await page.click('[data-testid="share-project-button"]');
        await page.click('[data-testid="permission-readonly"]');
        await page.click('[data-testid="generate-share-link-button"]');

        const shareLink = await page.inputValue('[data-testid="share-link-input"]');

        // 新しいページで共有リンクにアクセス
        const newPage = await context.newPage();
        await newPage.goto(shareLink, { waitUntil: "domcontentloaded" });

        // 読み取り専用モードであることを確認
        await expect(newPage.locator('[data-testid="readonly-indicator"]')).toBeVisible();

        // 編集ボタンが無効化されていることを確認
        await expect(newPage.locator('[data-testid="edit-button"]')).toBeDisabled();
    });

    test("project owner can manage shared users", async ({ page }) => {
        await page.goto("/test-project", { waitUntil: "domcontentloaded" });

        // 共有設定を開く
        await page.click('[data-testid="share-project-button"]');

        // 共有ユーザー管理タブに移動
        await page.click('[data-testid="manage-users-tab"]');

        // 共有ユーザーリストが表示されることを確認
        await expect(page.locator('[data-testid="shared-users-list"]')).toBeVisible();

        // ユーザーの権限を変更
        const firstUser = page.locator('[data-testid="user-item"]').first();
        await firstUser.locator('[data-testid="change-permission-button"]').click();
        await page.selectOption('[data-testid="permission-select"]', "admin");
        await page.click('[data-testid="save-permission-button"]');

        // 権限が更新されたことを確認
        await expect(page.locator('[data-testid="permission-updated-message"]')).toBeVisible();
    });

    test("shared project supports real-time collaboration", async ({ page, context }) => {
        // 編集権限で共有リンクを作成
        await page.goto("/test-project", { waitUntil: "domcontentloaded" });
        await page.click('[data-testid="share-project-button"]');
        await page.click('[data-testid="permission-edit"]');
        await page.click('[data-testid="generate-share-link-button"]');

        const shareLink = await page.inputValue('[data-testid="share-link-input"]');

        // 2つのページで同じプロジェクトを開く
        const page2 = await context.newPage();
        await page2.goto(shareLink, { waitUntil: "domcontentloaded" });

        // 最初のページでデータを変更
        await page.goto("/join-table", { waitUntil: "domcontentloaded" });
        await page.evaluate(async () => {
            const sql = (window as any).__JOIN_TABLE__?.sql;
            if (sql) {
                await sql.exec("INSERT INTO tbl VALUES('collab1','collaboration_test',123)");
                const store = (window as any).__JOIN_TABLE__?.store;
                if (store && store.run) {
                    await store.run();
                }
            }
        });

        // 2つ目のページでも変更が反映されることを確認
        await page2.goto("/join-table", { waitUntil: "domcontentloaded" });
        await page2.waitForFunction(() => {
            const sql = (window as any).__JOIN_TABLE__?.sql;
            if (!sql) return false;

            return sql.query("SELECT * FROM tbl WHERE id='collab1'").then(result => {
                return result.rows.length > 0;
            });
        }, { timeout: 10000 });

        const collaborationData = await page2.evaluate(async () => {
            const sql = (window as any).__JOIN_TABLE__?.sql;
            const result = await sql.query("SELECT * FROM tbl WHERE id='collab1'");
            return result.rows[0];
        });

        expect(collaborationData).toMatchObject({
            id: "collab1",
            value: "collaboration_test",
            num: 123,
        });
    });
});
