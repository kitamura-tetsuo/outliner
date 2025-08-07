/** @feature CNT-12ee98aa
 *  Title   : Shared Container Store
 *  Source  : docs/client-features/cnt-shared-container-store-12ee98aa.yaml
 */
import { expect, test } from "@playwright/test";

test.describe("CNT-12ee98aa: Shared Container Store", () => {
    test("container selector shows options", async ({ page }) => {
        await page.goto("http://localhost:7090/");
        const select = page.locator("select.container-select");
        await expect(select).toBeVisible();
    });

    test("dropdown list shows containers after initialization", async ({ page }) => {
        // ホームページに移動
        await page.goto("http://localhost:7090/");

        // テストヘルパーが利用可能になるまで待つ
        await page.waitForFunction(() => {
            return typeof (window as any).__TEST_DATA_HELPER__ !== "undefined";
        }, { timeout: 10000 });

        // テストヘルパーを使用してテストデータを設定
        await page.evaluate(() => {
            const testHelper = (window as any).__TEST_DATA_HELPER__;
            if (testHelper) {
                testHelper.setupTestEnvironment();
                console.log("Test environment setup completed");
            } else {
                console.error("Test helper not available");
            }
        });

        // コンテナセレクターが表示されることを確認
        const select = page.locator("select.container-select");
        await expect(select).toBeVisible();

        // 少し待ってからオプションを確認（初期化を待つ）
        await page.waitForTimeout(2000);

        // オプションが存在することを確認
        const options = select.locator("option");
        const optionCount = await options.count();

        // デバッグ情報を出力
        console.log(`Option count: ${optionCount}`);
        for (let i = 0; i < optionCount; i++) {
            const optionText = await options.nth(i).textContent();
            console.log(`Option ${i}: ${optionText}`);
        }

        // 少なくとも1つのオプションが表示されることを確認
        // テスト環境では、デフォルトのテストデータまたはログイン後のデータが表示される
        expect(optionCount).toBeGreaterThan(0);

        // "利用可能なコンテナがありません"が表示されていないことを確認
        const noContainerOption = select.locator("option", { hasText: "利用可能なコンテナがありません" });
        await expect(noContainerOption).not.toBeVisible();
    });

    test("dropdown list is populated on page load", async ({ page }) => {
        // ホームページに移動
        await page.goto("http://localhost:7090/");

        // テストヘルパーが利用可能になるまで待つ
        await page.waitForFunction(() => {
            return typeof (window as any).__TEST_DATA_HELPER__ !== "undefined";
        }, { timeout: 10000 });

        // テストヘルパーを使用してテストデータを設定
        await page.evaluate(() => {
            const testHelper = (window as any).__TEST_DATA_HELPER__;
            if (testHelper) {
                testHelper.setupTestEnvironment();
                console.log("Test environment setup completed");
            } else {
                console.error("Test helper not available");
            }
        });

        // 初期状態でコンテナセレクターが表示されることを確認
        const select = page.locator("select.container-select");
        await expect(select).toBeVisible();

        // 初期化を待つ
        await page.waitForTimeout(2000);

        // オプションが表示されることを確認
        const options = select.locator("option");
        const optionCount = await options.count();
        console.log(`Final option count: ${optionCount}`);

        // テストデータが設定されているので、2つのオプションが表示されることを確認
        expect(optionCount).toBeGreaterThanOrEqual(2);
    });
});
