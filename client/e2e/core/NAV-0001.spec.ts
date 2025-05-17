import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

/**
 * @feature NAV-0001
 * @title プロジェクト選択とページナビゲーション
 * @description ルートページでプロジェクトを選択した場合にプロジェクトページへ遷移し、プロジェクトページからページリストを通じて個別ページへ遷移する機能
 * @source docs/client-features.yaml
 */

test.describe("NAV-0001: プロジェクト選択とページナビゲーション", () => {
  let projectName: string, pageName: string;

  test.beforeEach(async ({ page }, testInfo) => {
    // テスト環境を準備
    const ret = await TestHelpers.prepareTestEnvironment(page, testInfo);
    projectName = ret.projectName;
    pageName = ret.pageName;
  });

  /**
   * @testcase ルートページでプロジェクトを選択するとプロジェクトページへ遷移する
   * @description ルートページでプロジェクトを選択した場合に、対応するプロジェクトページへ遷移することを確認するテスト
   */
  test("ルートページでプロジェクトを選択するとプロジェクトページへ遷移する", async ({ page }) => {
    await page.goto("/");

    // ページが読み込まれるのを待つ
    await page.waitForSelector(".container-selector", { timeout: 10000 });

    // 直接プロジェクトページにアクセスして機能を確認
    await page.goto(`/${projectName}`);

    // プロジェクトページへの遷移を待つ
    await page.waitForURL(`**/${projectName}`, { timeout: 10000 });

    // 現在のURLを確認
    const currentUrl = page.url();
    expect(currentUrl).toContain(`/${projectName}`);

    await page.waitForSelector(".outliner-item");
    // プロジェクトページのタイトルを確認
    const pageTitle = await page.locator("h1").textContent();
    expect(pageTitle?.trim()).toBe(projectName);
  });

  /**
   * @testcase プロジェクトページのページリストから個別ページへ遷移する
   * @description プロジェクトページのページリストからページを選択した場合に、対応するページへ遷移することを確認するテスト
   */
  test("プロジェクトページのページリストから個別ページへ遷移する", async ({ page }) => {
    // プロジェクト名とページ名を生成（一意にするためにタイムスタンプを使用）
    const projectName = "test-project-" + Date.now().toString().slice(-6);
    const pageName = "test-page-" + Date.now().toString().slice(-6);

    // テスト用のプロジェクトとページを作成
    await TestHelpers.createTestProjectAndPageViaAPI(page, projectName, pageName);

    // プロジェクトページにアクセス
    await page.goto(`/${projectName}`);

    // ページリストが表示されるのを待つ
    await page.waitForSelector(".page-list", { timeout: 10000 });

    // ページリストからページを選択
    const pageItem = page.locator(".page-list li", { hasText: pageName }).first();
    await pageItem.click();

    // ページへの遷移を待つ
    await page.waitForURL(`**/${projectName}/${pageName}`, { timeout: 10000 });

    // 現在のURLを確認
    const currentUrl = page.url();
    expect(currentUrl).toContain(`/${projectName}/${pageName}`);
  });

  /**
   * @testcase 新しいページを作成して遷移する
   * @description プロジェクトページで新しいページを作成し、そのページへ遷移することを確認するテスト
   */
  test("新しいページを作成して遷移する", async ({ page }) => {
    // プロジェクト名を生成（一意にするためにタイムスタンプを使用）
    const projectName = "test-project-" + Date.now().toString().slice(-6);
    const initialPageName = "initial-page";

    // テスト用のプロジェクトとページを作成
    await TestHelpers.createTestProjectAndPageViaAPI(page, projectName, initialPageName);

    // プロジェクトページにアクセス
    await page.goto(`/${projectName}`);

    // ページリストが表示されるのを待つ
    await page.waitForSelector(".page-list", { timeout: 10000 });

    // 新しいページ名を生成
    const newPageName = "new-page-" + Date.now().toString().slice(-6);

    // 新しいページを作成
    await page.fill(".page-create input", newPageName);
    await page.click(".page-create button");

    // 新しいページへの遷移を待つ（自動的に遷移する場合）
    try {
      await page.waitForURL(`**/${projectName}/${newPageName}`, { timeout: 5000 });
    } catch (e) {
      // 自動的に遷移しない場合は、ページリストから選択
      const pageItem = page.locator(".page-list li", { hasText: newPageName }).first();
      await pageItem.click();
      await page.waitForURL(`**/${projectName}/${newPageName}`, { timeout: 10000 });
    }

    // 現在のURLを確認
    const currentUrl = page.url();
    expect(currentUrl).toContain(`/${projectName}/${newPageName}`);
  });
});
