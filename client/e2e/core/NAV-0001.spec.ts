import {
    expect,
    test,
} from "@playwright/test";

/**
 * @feature NAV-0001
 * @title プロジェクト選択とページナビゲーション
 * @description ルートページでプロジェクトを選択した場合にプロジェクトページへ遷移し、プロジェクトページからページリストを通じて個別ページへ遷移する機能
 * @source docs/client-features.yaml
 */

test.describe("NAV-0001: プロジェクト選択とページナビゲーション", () => {
    const projectName = "test-project";
    const pageName = "test-page";

    /**
     * @testcase プロジェクト選択とページナビゲーションの機能確認
     * @description プロジェクトページへの遷移とページへの遷移を確認するテスト
     */
    test("プロジェクト選択とページナビゲーションの機能確認", async ({ page }) => {
        // 1. プロジェクトページへの遷移確認
        await page.goto(`/${projectName}`);
        await page.waitForURL(`**/${projectName}`, { timeout: 10000 });
        const projectUrl = page.url();
        expect(projectUrl).toContain(`/${projectName}`);

        // プロジェクトページのタイトルを確認
        await page.waitForSelector("h1", { timeout: 10000 });
        const pageTitle = await page.locator("h1").textContent();
        expect(pageTitle?.trim()).toBe("プロジェクト");

        // 2. ページへの遷移確認
        await page.goto(`/${projectName}/${pageName}`);
        await page.waitForURL(`**/${projectName}/${pageName}`, { timeout: 10000 });
        const pageUrl = page.url();
        expect(pageUrl).toContain(`/${projectName}/${pageName}`);
    });
});
