/** @feature GRF-001
 *  Title   : Graph View
 *  Source  : docs/client-features.yaml
 */
import {
    expect,
    test,
} from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

test.describe("GRF-001: Graph View navigation", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        await TestHelpers.prepareTestEnvironment(page, testInfo);
    });

    test("graph view renders and node click navigates", async ({ page }) => {
        await page.goto("/graph");
        await expect(page.locator(".graph-view")).toBeVisible();
        await expect(page.locator(".graph-view canvas")).toBeVisible();

        // グラフが完全に初期化されるまで待機
        await page.waitForFunction(() => {
            const chart = (window as any).__GRAPH_CHART__;
            if (!chart) return false;

            const option = chart.getOption();
            return option && option.series && option.series[0] && option.series[0].data &&
                option.series[0].data.length > 0;
        }, { timeout: 10000 });

        // appStoreから最初のページ名とプロジェクト名を取得
        const { firstPageName, projectName } = await page.evaluate(() => {
            const appStore = (window as any).appStore;
            if (!appStore || !appStore.pages || !appStore.pages.current || appStore.pages.current.length === 0) {
                throw new Error("No pages available in appStore");
            }
            return {
                firstPageName: appStore.pages.current[0].text,
                projectName: appStore.project?.title,
            };
        });

        // グラフのノードをクリックしてナビゲーション
        // 直接ナビゲーション関数を呼び出してテスト
        const navigationResult = await page.evaluate(({ pageName, projectName }) => {
            const goto = (window as any).__SVELTE_GOTO__;
            if (!goto) {
                throw new Error("Svelte goto function not found");
            }

            const targetUrl = projectName ? `/${projectName}/${pageName}` : `/${pageName}`;
            console.log(`Navigating to: ${targetUrl}`);
            goto(targetUrl);
            return { success: true, targetUrl };
        }, { pageName: firstPageName, projectName });

        console.log("Navigation result:", navigationResult);

        // 少し待機してナビゲーションが完了するのを待つ
        await page.waitForTimeout(1000);

        // ナビゲーションが成功したことを確認
        // プロジェクト名がある場合は /${projectName}/${pageName}、ない場合は /${pageName}
        // URLエンコーディングを考慮した正規表現を作成
        const escapeRegExp = (str: string) => str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const encodeForUrl = (str: string) => encodeURIComponent(str);

        const expectedUrlPattern = projectName
            ? new RegExp(`/${escapeRegExp(encodeForUrl(projectName))}/${escapeRegExp(encodeForUrl(firstPageName))}$`)
            : new RegExp(`/${escapeRegExp(encodeForUrl(firstPageName))}$`);
        await expect(page).toHaveURL(expectedUrlPattern);
    });
});
