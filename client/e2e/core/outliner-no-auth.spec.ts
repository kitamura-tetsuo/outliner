import { expect, test } from "@playwright/test";
import { TestHelpersNoAuth } from "../utils/testHelpersNoAuth.js";

test.describe("Outliner No Auth Test", () => {
    test("can load and interact with outliner without authentication", async ({ page }, testInfo) => {
        console.log("Debug: Testing outliner without authentication");

        // エラー監視を設定
        const errors = TestHelpersNoAuth.setupErrorMonitoring(page);

        // ネットワーク監視を設定
        const network = TestHelpersNoAuth.setupNetworkMonitoring(page);

        // 環境準備（認証なし）
        const envResult = await TestHelpersNoAuth.prepareTestEnvironmentNoAuth(page, testInfo);
        console.log("Debug: Environment preparation result:", envResult);

        expect(envResult.success).toBe(true);

        // 基本要素の確認
        const elementsValid = await TestHelpersNoAuth.verifyBasicElements(page);
        expect(elementsValid).toBe(true);

        // アウトライナー要素の確認
        const outlinerElements = await TestHelpersNoAuth.findOutlinerElements(page);
        console.log("Debug: Outliner elements found:", outlinerElements);

        // 基本的なキーボード操作をテスト
        await page.keyboard.press("Escape");
        console.log("Debug: Pressed Escape key");

        // 少し待機してエラーを収集
        await page.waitForTimeout(2000);

        // エラーレポート
        if (errors.length > 0) {
            console.log("Debug: JavaScript errors detected:", errors);
        } else {
            console.log("Debug: No JavaScript errors detected");
        }

        // ネットワークレポート
        console.log("Debug: Network requests:", network.requests.length);
        console.log("Debug: Network responses:", network.responses.length);

        // 失敗したリクエストを確認
        const failedRequests = network.responses.filter(r => r.status >= 400);
        if (failedRequests.length > 0) {
            console.log("Debug: Failed requests:", failedRequests);
        }
    });

    test("can check application state without authentication", async ({ page }, testInfo) => {
        console.log("Debug: Testing application state without authentication");

        // 環境準備
        const envResult = await TestHelpersNoAuth.prepareTestEnvironmentNoAuth(page, testInfo);
        expect(envResult.success).toBe(true);

        // アプリケーションの状態を確認
        const appState = await page.evaluate(() => {
            const win = window as any;
            return {
                // グローバル変数の確認
                userManager: typeof win.__USER_MANAGER__,
                svelteGoto: typeof win.__SVELTE_GOTO__,
                firebaseApp: typeof win.__firebase_client_app__,

                // DOM状態の確認
                readyState: document.readyState,
                location: window.location.href,

                // 基本的なDOM要素の確認
                bodyExists: !!document.body,
                headExists: !!document.head,

                // Svelteアプリの状態
                svelteKit: typeof win.__SVELTEKIT_DEV__,

                // 利用可能なグローバル変数
                allGlobals: Object.keys(win).filter(key => key.startsWith("__")),
            };
        });

        console.log("Debug: Application state:", appState);

        // 基本的な状態の確認
        expect(appState.readyState).toBe("complete");
        expect(appState.bodyExists).toBe(true);
        expect(appState.headExists).toBe(true);
        expect(appState.location).toMatch(/localhost:7090/);

        // UserManagerが存在することを確認（認証なしでも初期化される）
        if (appState.userManager === "object") {
            console.log("Debug: UserManager is available");
        } else {
            console.log("Debug: UserManager is not available");
        }
    });

    test("can perform basic DOM interactions without authentication", async ({ page }, testInfo) => {
        console.log("Debug: Testing basic DOM interactions without authentication");

        // 環境準備
        const envResult = await TestHelpersNoAuth.prepareTestEnvironmentNoAuth(page, testInfo);
        expect(envResult.success).toBe(true);

        // 基本的なクリック操作
        const body = page.locator("body");
        await body.click();
        console.log("Debug: Clicked on body");

        // キーボード操作
        await page.keyboard.press("Tab");
        console.log("Debug: Pressed Tab key");

        await page.keyboard.press("Enter");
        console.log("Debug: Pressed Enter key");

        await page.keyboard.press("ArrowDown");
        console.log("Debug: Pressed ArrowDown key");

        await page.keyboard.press("ArrowUp");
        console.log("Debug: Pressed ArrowUp key");

        // テキスト入力をテスト
        await page.keyboard.type("test input");
        console.log("Debug: Typed test input");

        // 少し待機
        await page.waitForTimeout(1000);

        // ページの状態が安定していることを確認
        const finalUrl = page.url();
        console.log("Debug: Final URL:", finalUrl);
        expect(finalUrl).toMatch(/localhost:7090/);
    });
});
import "../utils/registerAfterEachSnapshot";
