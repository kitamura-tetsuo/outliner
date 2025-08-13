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
                && typeof (window as any).__FLUID_SERVICE__ !== "undefined"
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

        await page.evaluate(() => {
            const fsStore = (window as any).__FLUID_SERVICE__.firestoreStore;
            fsStore.titleRegistry.set("c1", "Project A");
            fsStore.titleRegistry.set("c2", "Project B");
            const store = (window as any).__FIRESTORE_STORE__;
            store.userContainer = {
                userId: "u1",
                defaultContainerId: "c1",
                accessibleContainerIds: ["c1", "c2"],
                createdAt: new Date(),
                updatedAt: new Date(),
            };
        });

        // UI反映を待つ
        await page.waitForFunction(() => document.querySelectorAll("select.container-select option").length >= 2);

        const options = page.locator("select.container-select option");
        await expect(options).toHaveCount(2);
        await expect(options.nth(0)).toHaveText(/Project A/);
        await expect(options.nth(1)).toHaveText(/Project B/);
    });

    test("deletion page shows projects from store", async ({ page }) => {
        // 自動シードを無効化
        await page.addInitScript(() => {
            window.localStorage.setItem("SKIP_TEST_CONTAINER_SEED", "true");
        });

        // 直接削除ページへ移動（ページ遷移で状態が消えないよう、この後にストアをセットする）
        await page.goto("/projects/delete");

        // Hydration完了とグローバルの公開を待つ
        await page.waitForFunction(() => {
            return typeof (window as any).__FIRESTORE_STORE__ !== "undefined"
                && typeof (window as any).__FLUID_SERVICE__ !== "undefined"
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

        // 削除ページに到着してからストアを直接更新
        await page.evaluate(() => {
            const fsStore = (window as any).__FLUID_SERVICE__.firestoreStore;
            fsStore.titleRegistry.set("c1", "Project A");
            fsStore.titleRegistry.set("c2", "Project B");
            const store = (window as any).__FIRESTORE_STORE__;
            store.userContainer = {
                userId: "u1",
                defaultContainerId: "c1",
                accessibleContainerIds: ["c1", "c2"],
                createdAt: new Date(),
                updatedAt: new Date(),
            };
        });

        // テーブル反映を待つ
        await page.waitForFunction(() => document.querySelectorAll("tbody tr").length >= 2);
        const rows = page.locator("tbody tr");
        await expect(rows).toHaveCount(2);
        await expect(rows.nth(0).locator("td").nth(1)).toHaveText("Project A");
        await expect(rows.nth(1).locator("td").nth(1)).toHaveText("Project B");
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
