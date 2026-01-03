import "../utils/registerAfterEachSnapshot";
import { expect, test } from "@playwright/test";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
import { TestHelpers } from "../utils/testHelpers";
registerCoverageHooks();

/**
 * @feature NAV-0001
 * @title プロジェクト選択とページナビゲーション
 * @description ルートページでプロジェクトを選択した場合にプロジェクトページへ遷移し、プロジェクトページからページリストを通じて個別ページへ遷移する機能
 * @source docs/client-features.yaml
 */

test.describe("NAV-0001: プロジェクト選択とページナビゲーション", () => {
    /**
     * @testcase プロジェクト選択とページナビゲーションの機能確認
     * @description プロジェクトページへの遷移とページへの遷移を確認するテスト
     */
    test("プロジェクト選択とページナビゲーションの機能確認", async ({ page }, testInfo) => {
        // Prepare the test environment by creating the project and page programmatically
        const { projectName, pageName } = await TestHelpers.prepareTestEnvironment(page, testInfo, []);

        // 1. プロジェクトページへの遷移確認
        await page.goto(`/${projectName}`, { waitUntil: "load" });
        await page.waitForTimeout(500); // Wait for hydration and rendering
        await expect(page).toHaveURL(new RegExp(`.*/${encodeURIComponent(projectName)}$`), { timeout: 10000 });
        const projectUrl = page.url();
        expect(projectUrl).toContain(encodeURIComponent(projectName));

        // Wait for the project name to appear in the h1 element
        // The project page shows the project name in h1 after the project data is loaded
        await expect(page.locator("main h1")).toContainText(projectName, { timeout: 15000 });

        // 2. ページへの遷移確認
        await page.goto(`/${projectName}/${pageName}`);
        await expect(page).toHaveURL(
            new RegExp(`.*/${encodeURIComponent(projectName)}/${encodeURIComponent(pageName)}$`),
            { timeout: 10000 },
        );
        const pageUrl = page.url();
        expect(pageUrl).toContain(`${encodeURIComponent(projectName)}/${encodeURIComponent(pageName)}`);
    });
});
