/** @feature LNK-0007
 *  Title   : バックリンク機能
 *  Source  : docs/client-features.yaml
 */
import {
    expect,
    test,
} from "@playwright/test";
import { CursorValidator } from "../utils/cursorValidation";
import { TestHelpers } from "../utils/testHelpers";
import { TreeValidator } from "../utils/treeValidation";

/**
 * @file LNK-0007.spec.ts
 * @description バックリンク機能のテスト
 * @category navigation
 * @title バックリンク機能
 */
test.describe("LNK-0007: バックリンク機能", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        await TestHelpers.prepareTestEnvironment(page, testInfo);
    });

    /**
     * @testcase ページにバックリンクパネルが表示される
     * @description ページにバックリンクパネルが表示されることを確認するテスト
     */
    test("ページにバックリンクパネルが表示される", async ({ page }) => {
        // テスト用のプロジェクトとページを作成
        const projectName = "test-project-" + Date.now().toString().slice(-6);
        const targetPageName = "target-page-" + Date.now().toString().slice(-6);

        // プロジェクトを作成
        const fluidClient = await TestHelpers.createTestProject(page, projectName);

        // ターゲットページを作成
        await TestHelpers.createTestPage(page, fluidClient, targetPageName, [
            "これはターゲットページの内容です。"
        ]);

        // ターゲットページに移動
        await page.goto(`/${projectName}/${targetPageName}`);
        await page.waitForTimeout(1000);

        // 認証が必要な場合はログイン
        const loginButton = page.locator("button:has-text('開発者ログイン')");
        if (await loginButton.isVisible()) {
            await loginButton.click();
            await page.waitForTimeout(1000);
        }

        // ページが読み込まれるまで待機
        await page.waitForTimeout(1000);

        // バックリンクパネルが表示されていることを確認
        const backlinkPanel = page.locator(".backlink-panel");
        await expect(backlinkPanel).toBeVisible();

        // バックリンクトグルボタンが表示されていることを確認
        const toggleButton = page.locator(".backlink-toggle-button");
        await expect(toggleButton).toBeVisible();

        // バックリンクカウントが表示されていることを確認
        const backlinkCount = page.locator(".backlink-count");
        await expect(backlinkCount).toBeVisible();

        // テスト成功
        console.log("ページにバックリンクパネルが表示されるテストが成功しました。");
    });

    /**
     * @testcase バックリンクパネルにリンク元ページの一覧が表示される
     * @description バックリンクパネルにリンク元ページの一覧が表示されることを確認するテスト
     */
    test("バックリンクパネルにリンク元ページの一覧が表示される", async ({ page }) => {
        // テスト用のプロジェクトとページを作成
        const projectName = "test-project-" + Date.now().toString().slice(-6);
        const sourcePageName = "source-page-" + Date.now().toString().slice(-6);
        const targetPageName = "target-page-" + Date.now().toString().slice(-6);

        // プロジェクトを作成
        const fluidClient = await TestHelpers.createTestProject(page, projectName);

        // ソースページを作成（ターゲットページへのリンクを含む）
        await TestHelpers.createTestPage(page, fluidClient, sourcePageName, [
            `これはソースページです。`,
            `ターゲットページへのリンク: [${targetPageName}]`,
            `その他の内容です。`
        ]);

        // ターゲットページを作成
        await TestHelpers.createTestPage(page, fluidClient, targetPageName, [
            "これはターゲットページの内容です。"
        ]);

        // ターゲットページに移動
        await page.goto(`/${projectName}/${targetPageName}`);
        await page.waitForTimeout(1000);

        // 認証が必要な場合はログイン
        const loginButton = page.locator("button:has-text('開発者ログイン')");
        if (await loginButton.isVisible()) {
            await loginButton.click();
            await page.waitForTimeout(1000);
        }

        // ページが読み込まれるまで待機
        await page.waitForTimeout(1000);

        // バックリンクパネルを開く
        await TestHelpers.openBacklinkPanel(page);
        await page.waitForTimeout(500);

        // バックリンクパネルの内容が表示されていることを確認
        const backlinkContent = page.locator(".backlink-content");
        await expect(backlinkContent).toBeVisible();

        // バックリンクリストが表示されていることを確認
        const backlinkList = page.locator(".backlink-list");
        await expect(backlinkList).toBeVisible();

        // リンク元ページが表示されていることを確認
        const sourcePageLink = backlinkList.locator(".source-page-link");
        await expect(sourcePageLink).toBeVisible();

        // ソースページ名が正しく表示されていることを確認
        const linkText = await sourcePageLink.textContent();
        expect(linkText).toBe(sourcePageName);

        // リンク元ページのコンテキストが表示されていることを確認
        const backlinkContext = backlinkList.locator(".backlink-context");
        await expect(backlinkContext).toBeVisible();

        // コンテキストにターゲットページ名が含まれているか確認
        const contextText = await backlinkContext.textContent();
        expect(contextText).toContain(`[${targetPageName}]`);

        // テスト成功
        console.log("バックリンクパネルにリンク元ページの一覧が表示されるテストが成功しました。");
    });

    /**
     * @testcase バックリンクの数がバッジとして表示される
     * @description バックリンクの数がバッジとして表示されることを確認するテスト
     */
    test("バックリンクの数がバッジとして表示される", async ({ page }) => {
        // テスト用のプロジェクトとページを作成
        const projectName = "test-project-" + Date.now().toString().slice(-6);
        const sourcePageName1 = "source-page-1-" + Date.now().toString().slice(-6);
        const sourcePageName2 = "source-page-2-" + Date.now().toString().slice(-6);
        const targetPageName = "target-page-" + Date.now().toString().slice(-6);

        // プロジェクトを作成
        const fluidClient = await TestHelpers.createTestProject(page, projectName);

        // 複数のソースページを作成（ターゲットページへのリンクを含む）
        await TestHelpers.createTestPage(page, fluidClient, sourcePageName1, [
            `これは最初のソースページです。`,
            `ターゲットページへのリンク: [${targetPageName}]`
        ]);

        await TestHelpers.createTestPage(page, fluidClient, sourcePageName2, [
            `これは2番目のソースページです。`,
            `同じターゲットページへのリンク: [${targetPageName}]`
        ]);

        // ターゲットページを作成
        await TestHelpers.createTestPage(page, fluidClient, targetPageName, [
            "これはターゲットページの内容です。"
        ]);

        // ターゲットページに移動
        await page.goto(`/${projectName}/${targetPageName}`);
        await page.waitForTimeout(1000);

        // 認証が必要な場合はログイン
        const loginButton = page.locator("button:has-text('開発者ログイン')");
        if (await loginButton.isVisible()) {
            await loginButton.click();
            await page.waitForTimeout(1000);
        }

        // ページが読み込まれるまで待機
        await page.waitForTimeout(1000);

        // バックリンクの数を表示するバッジが表示されていることを確認
        const backlinkCount = page.locator(".backlink-count");
        await expect(backlinkCount).toBeVisible();

        // バッジに正しい数字が表示されていることを確認（2つのソースページからのリンク）
        const countText = await backlinkCount.textContent();
        expect(countText).toBe("2");

        // テスト成功
        console.log("バックリンクの数がバッジとして表示されるテストが成功しました。");
    });

    /**
     * @testcase バックリンクパネルを開閉できる
     * @description バックリンクパネルを開閉できることを確認するテスト
     */
    test("バックリンクパネルを開閉できる", async ({ page }) => {
        // テスト用のプロジェクトとページを作成
        const projectName = "test-project-" + Date.now().toString().slice(-6);
        const targetPageName = "target-page-" + Date.now().toString().slice(-6);

        // プロジェクトを作成
        const fluidClient = await TestHelpers.createTestProject(page, projectName);

        // ターゲットページを作成
        await TestHelpers.createTestPage(page, fluidClient, targetPageName, [
            "これはターゲットページの内容です。"
        ]);

        // ターゲットページに移動
        await page.goto(`/${projectName}/${targetPageName}`);
        await page.waitForTimeout(1000);

        // 認証が必要な場合はログイン
        const loginButton = page.locator("button:has-text('開発者ログイン')");
        if (await loginButton.isVisible()) {
            await loginButton.click();
            await page.waitForTimeout(1000);
        }

        // ページが読み込まれるまで待機
        await page.waitForTimeout(1000);

        // 初期状態ではバックリンクパネルの内容が非表示であることを確認
        const backlinkContent = page.locator(".backlink-content");
        await expect(backlinkContent).not.toBeVisible();

        // バックリンクパネルのトグルボタンをクリック
        const toggleButton = page.locator(".backlink-toggle-button");
        await toggleButton.click();
        await page.waitForTimeout(500);

        // バックリンクパネルの内容が表示されていることを確認
        await expect(backlinkContent).toBeVisible();

        // トグルボタンがアクティブ状態になっていることを確認
        await expect(toggleButton).toHaveClass(/active/);

        // もう一度トグルボタンをクリック
        await toggleButton.click();
        await page.waitForTimeout(500);

        // バックリンクパネルの内容が非表示になっていることを確認
        await expect(backlinkContent).not.toBeVisible();

        // トグルボタンがアクティブ状態でなくなっていることを確認
        await expect(toggleButton).not.toHaveClass(/active/);

        // テスト成功
        console.log("バックリンクパネルを開閉できるテストが成功しました。");
    });

    /**
     * @testcase バックリンクをクリックするとリンク元ページに移動できる
     * @description バックリンクをクリックするとリンク元ページに移動できることを確認するテスト
     */
    test("バックリンクをクリックするとリンク元ページに移動できる", async ({ page }) => {
        // テスト用のプロジェクトとページを作成
        const projectName = "test-project-" + Date.now().toString().slice(-6);
        const sourcePageName = "source-page-" + Date.now().toString().slice(-6);
        const targetPageName = "target-page-" + Date.now().toString().slice(-6);

        // プロジェクトを作成
        const fluidClient = await TestHelpers.createTestProject(page, projectName);

        // ソースページを作成（ターゲットページへのリンクを含む）
        await TestHelpers.createTestPage(page, fluidClient, sourcePageName, [
            `これはソースページです。`,
            `ターゲットページへのリンク: [${targetPageName}]`
        ]);

        // ターゲットページを作成
        await TestHelpers.createTestPage(page, fluidClient, targetPageName, [
            "これはターゲットページの内容です。"
        ]);

        // ターゲットページに移動
        await page.goto(`/${projectName}/${targetPageName}`);
        await page.waitForTimeout(1000);

        // 認証が必要な場合はログイン
        const loginButton = page.locator("button:has-text('開発者ログイン')");
        if (await loginButton.isVisible()) {
            await loginButton.click();
            await page.waitForTimeout(1000);
        }

        // ページが読み込まれるまで待機
        await page.waitForTimeout(1000);

        // バックリンクパネルを開く
        await TestHelpers.openBacklinkPanel(page);
        await page.waitForTimeout(500);

        // バックリンクリストが表示されていることを確認
        const backlinkList = page.locator(".backlink-list");
        await expect(backlinkList).toBeVisible();

        // リンク元ページへのリンクをクリック
        const sourcePageLink = backlinkList.locator(".source-page-link").first();
        await expect(sourcePageLink).toBeVisible();

        // リンクをクリック
        await sourcePageLink.click();
        await page.waitForTimeout(1000);

        // ソースページに移動したことを確認
        const currentUrl = page.url();
        expect(currentUrl).toContain(sourcePageName);
        expect(currentUrl).not.toContain(targetPageName);

        // ページタイトルが正しく表示されていることを確認
        const pageTitle = page.locator("h1");
        await expect(pageTitle).toContainText(sourcePageName);

        // テスト成功
        console.log("バックリンクをクリックするとリンク元ページに移動できるテストが成功しました。");
    });
});
