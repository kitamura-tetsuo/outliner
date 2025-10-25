import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
/** @feature TOO-0001
 *  Title   : ツールバーのSearchBox表示機能
 *  Source  : manual test
 */
import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

test.describe("TOO-0001: ツールバーのSearchBox表示機能", () => {
    let _projectName: string;
    let _pageName: string;

    test.beforeEach(async ({ page }, testInfo) => {
        const result = await TestHelpers.prepareTestEnvironment(page, testInfo);
        projectName = result.projectName;
        pageName = result.pageName;
    });

    test("ツールバーが上部に固定表示される", async ({ page }) => {
        // ツールバーが表示されることを確認
        // SSRシェルのtoolbarではなく、クライアント側でマウントされたtoolbarを選択
        // 2番目の要素がクライアント側のtoolbar
        const toolbar = page.getByTestId("main-toolbar").last();
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
        // SSRシェルのtoolbarではなく、クライアント側でマウントされたtoolbarを選択
        // 2番目の要素がクライアント側のtoolbar
        const toolbar = page.getByTestId("main-toolbar").last();
        const searchBoxInToolbar = toolbar.locator(".page-search-box");
        await expect(searchBoxInToolbar).toBeVisible();
    });

    test("メインコンテンツがツールバーの下に表示される", async ({ page }) => {
        // メインコンテンツが表示されることを確認
        // SSRシェルのmain-contentではなく、クライアント側でマウントされたmain-contentを選択
        // 2番目の要素がクライアント側のmain-content
        const mainContent = page.locator(".main-content").last();
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
        // SSRシェルのinputではなく、クライアント側でマウントされたinputを選択
        // 2番目の要素がクライアント側のinput
        const searchInput = page.locator(".page-search-box input").last();
        await expect(searchInput).toBeVisible();

        // 入力フィールドにテキストを入力
        await searchInput.fill("test");

        // 入力された値を確認
        await expect(searchInput).toHaveValue("test");
    });
});
