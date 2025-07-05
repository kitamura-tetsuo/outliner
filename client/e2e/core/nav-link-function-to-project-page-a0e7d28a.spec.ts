/** @feature NAV-0002
 *  Title   : プロジェクトページへのリンク機能
 *  Source  : docs/client-features.yaml
 */
import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

test.describe("NAV-0002: プロジェクトページへのリンク機能", () => {
    let projectName: string;
    let pageName: string;

    test.beforeEach(async ({ page }, testInfo) => {
        const result = await TestHelpers.prepareTestEnvironment(page, testInfo);
        projectName = result.projectName;
        pageName = result.pageName;
    });

    test("ページ表示時にパンくずナビゲーションが表示される", async ({ page }) => {
        // パンくずナビゲーションが表示されることを確認
        const breadcrumbNav = page.locator("nav");
        await expect(breadcrumbNav).toBeVisible();
    });

    test("パンくずナビゲーションにホームへのリンクが表示される", async ({ page }) => {
        // ホームへのリンクが表示されることを確認
        const homeLink = page.locator('nav button:has-text("ホーム")');
        await expect(homeLink).toBeVisible();
        await expect(homeLink).toHaveClass(/text-blue-600/);
    });

    test("パンくずナビゲーションにプロジェクトページへのリンクが表示される", async ({ page }) => {
        // プロジェクトページへのリンクが表示されることを確認
        const projectLink = page.locator(`nav button:has-text("${projectName}")`);
        await expect(projectLink).toBeVisible();
        await expect(projectLink).toHaveClass(/text-blue-600/);
    });

    test("パンくずナビゲーションに現在のページ名が表示される", async ({ page }) => {
        // 現在のページ名が表示されることを確認
        const currentPageName = page.locator(`nav span:has-text("${pageName}")`);
        await expect(currentPageName).toBeVisible();
        await expect(currentPageName).toHaveClass(/text-gray-900/);
    });

    test("プロジェクトページへのリンクをクリックするとプロジェクトページに遷移する", async ({ page }) => {
        // プロジェクトページへのリンクをクリック
        const projectLink = page.locator(`nav button:has-text("${projectName}")`);
        await projectLink.click();

        // プロジェクトページに遷移したことを確認
        await expect(page).toHaveURL(`/${projectName}`);

        // プロジェクトページのタイトルが表示されることを確認
        const pageTitle = page.locator(`h1:has-text("${projectName}")`);
        await expect(pageTitle).toBeVisible();
    });

    test("ホームへのリンクをクリックするとホームページに遷移する", async ({ page }) => {
        // ホームへのリンクをクリック
        const homeLink = page.locator('nav button:has-text("ホーム")');
        await homeLink.click();

        // ホームページに遷移したことを確認
        await expect(page).toHaveURL("/");

        // ホームページのタイトルが表示されることを確認
        const pageTitle = page.locator('h1:has-text("Fluid Outliner")');
        await expect(pageTitle).toBeVisible();
    });

    test("パンくずナビゲーションの区切り文字が正しく表示される", async ({ page }) => {
        // 区切り文字が正しく表示されることを確認
        const separators = page.locator('nav span:has-text("/")');
        await expect(separators).toHaveCount(2); // ホーム / プロジェクト / ページ

        // 区切り文字のスタイルが正しいことを確認
        await expect(separators.first()).toHaveClass(/mx-2/);
    });
});
