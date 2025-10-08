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

    test("container selector lists projects from store", async ({ page }) => {
        // 自動シードを無効化
        await page.addInitScript(() => {
            window.localStorage.setItem("SKIP_TEST_CONTAINER_SEED", "true");
        });
        await page.goto("/");

        // Hydration完了とグローバルの公開を待つ
        await page.waitForFunction(() => {
            return typeof (window as any).__FIRESTORE_STORE__ !== "undefined"
                && typeof (window as any).__TEST_DATA_HELPER__ !== "undefined"
                && typeof (window as any).__USER_MANAGER__ !== "undefined";
        }, { timeout: 10000 });

        // Firebaseのテストユーザーでログイン完了を待つ
        await page.waitForFunction(() => {
            try {
                const um = (window as any).__USER_MANAGER__;
                return !!(um && um.auth && um.auth.currentUser);
            } catch {
                return false;
            }
        }, { timeout: 20000 });

        await page.evaluate(() => (window as any).__TEST_DATA_HELPER__?.setupTestEnvironment?.());

        // UI反映を待つ
        await page.waitForFunction(() => document.querySelectorAll("select.container-select option").length >= 2);

        const options = page.locator("select.container-select option");
        await expect(options).toHaveCount(2);
        await expect(options.nth(0)).toHaveText(/テストプロジェクト/);
        await expect(options.nth(1)).toHaveText(/テストプロジェクト/);
    });

    test("deletion page shows projects from store", async ({ page }) => {
        // 自動シードを無効化
        await page.addInitScript(() => {
            window.localStorage.setItem("SKIP_TEST_CONTAINER_SEED", "true");
        });

        // Navigate to deletion page
        await page.goto("/projects/delete");

        // Hydration完了とグローバルの公開を待つ
        await page.waitForFunction(() => {
            return typeof (window as any).__FIRESTORE_STORE__ !== "undefined"
                && typeof (window as any).__TEST_DATA_HELPER__ !== "undefined"
                && typeof (window as any).__USER_MANAGER__ !== "undefined";
        }, { timeout: 10000 });

        // Firebaseのテストユーザーでログイン完了を待つ
        await page.waitForFunction(() => {
            try {
                const um = (window as any).__USER_MANAGER__;
                return !!(um && um.auth && um.auth.currentUser);
            } catch {
                return false;
            }
        }, { timeout: 20000 });

        // Update the store and wait for update
        await page.evaluate(() => (window as any).__TEST_DATA_HELPER__?.setupTestEnvironment?.());

        // Wait for the update to propagate to the container store
        await page.waitForFunction(() => {
            const containerStore = (window as any).__CONTAINER_STORE__;
            return containerStore && containerStore.containers && containerStore.containers.length >= 2;
        }, { timeout: 10000 });

        // Force a small delay to ensure all reactive updates are processed
        await page.waitForTimeout(3000);

        // Check if the table exists now
        const tableExists = await page.locator("table").count();
        console.log(`Table elements found: ${tableExists}`);

        if (tableExists > 0) {
            // Wait for table rows to appear using Playwright's auto-waiting
            const rows = page.locator("tbody tr");
            await expect(rows).toHaveCount(2, { timeout: 30000 });
            await expect(rows.nth(0).locator("td").nth(1)).toContainText("テストプロジェクト");
            await expect(rows.nth(1).locator("td").nth(1)).toContainText("テストプロジェクト");
        } else {
            // If table doesn't exist, the projects list might be empty
            const noProjectsText = page.locator('text="No projects found."');
            await expect(noProjectsText).toBeVisible();
            throw new Error(
                "Projects were not displayed in the table. Component may not be reactive to store changes.",
            );
        }
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
import "../utils/registerAfterEachSnapshot";
