/** @feature TOO-0001
 *  Title   : ツールバーのSearchBox表示機能
 *  Source  : manual test
 */
import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

test.describe("TOO-0001: ツールバーのSearchBox表示機能", () => {
    let projectName: string;
    let pageName: string;

    test.beforeEach(async ({ page }, testInfo) => {
        const result = await TestHelpers.prepareTestEnvironment(page, testInfo);
        projectName = result.projectName;
        pageName = result.pageName;
    });

    test("ツールバーが上部に固定表示される", async ({ page }) => {
        // ツールバーが表示されることを確認
        const toolbar = page.getByTestId("main-toolbar");
        await expect(toolbar).toBeVisible();

        // ツールバーが固定位置にあることを確認
        const toolbarStyles = await toolbar.evaluate((el) => {
            const styles = window.getComputedStyle(el);
            return {
                position: styles.position,
                top: styles.top,
                zIndex: styles.zIndex,
            };
        });

        expect(toolbarStyles.position).toBe("fixed");
        expect(toolbarStyles.top).toBe("0px");
        expect(parseInt(toolbarStyles.zIndex)).toBeGreaterThan(999);
    });

    test("SearchBoxがツールバー内に表示される", async ({ page }) => {
        // SearchBoxが表示されることを確認
        const searchBox = page.locator(".page-search-box");
        await expect(searchBox).toBeVisible();

        // SearchBoxがツールバー内にあることを確認
        const toolbar = page.getByTestId("main-toolbar");
        const searchBoxInToolbar = toolbar.locator(".page-search-box");
        await expect(searchBoxInToolbar).toBeVisible();
    });

    test("メインコンテンツがツールバーの下に表示される", async ({ page }) => {
        // メインコンテンツが表示されることを確認
        const mainContent = page.locator(".main-content");
        await expect(mainContent).toBeVisible();

        // メインコンテンツにパディングが適用されていることを確認
        const mainContentStyles = await mainContent.evaluate((el) => {
            const styles = window.getComputedStyle(el);
            return {
                paddingTop: styles.paddingTop,
            };
        });

        // 4rem = 64px のパディングが適用されていることを確認
        expect(parseInt(mainContentStyles.paddingTop)).toBeGreaterThanOrEqual(60);
    });

    test("SearchBoxの入力フィールドが機能する", async ({ page }) => {
        // SearchBoxの入力フィールドを取得
        const searchInput = page.locator(".page-search-box input");
        await expect(searchInput).toBeVisible();

        // 入力フィールドにテキストを入力
        await searchInput.fill("test");

        // 入力された値を確認
        await expect(searchInput).toHaveValue("test");
    });
});
import "../utils/registerAfterEachSnapshot";
