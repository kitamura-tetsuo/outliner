import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
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
        const projectLink = page.getByTestId("breadcrumb-project");
        await projectLink.waitFor({ state: "visible", timeout: 10000 });
        await projectLink.click();

        // プロジェクトページに遷移したことを確認
        // URLエンコーディングの扱いによる差異（スペースが%20か+かなど）を吸収するため、デコードして比較を行う
        await expect.poll(() => {
            const path = new URL(page.url()).pathname;
            const decoded = decodeURIComponent(path).replace(/\+/g, " ");
            return decoded;
        }, { timeout: 20000 }).toContain(projectName);

        // プロジェクトページが完全にロードされるのを待つ
        // プロジェクトページのタイトルが表示されることを確認
        // プロジェクト名がページのどこかに表示されていることを確認（h1要素以外の可能性も考慮）
        const projectElement = page.locator(`text="${projectName}"`);
        await expect(projectElement).toBeVisible({ timeout: 15000 });
    });

    test("ホームへのリンクをクリックするとホームページに遷移する", async ({ page }) => {
        // ホームへのリンクをクリック
        const homeLink = page.locator('nav button:has-text("ホーム")');
        await homeLink.click();

        // ホームページに遷移したことを確認
        await expect(page).toHaveURL("/");

        // ホームページのタイトルが表示されることを確認
        const pageTitle = page.locator('h1:has-text("Outliner")');
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
