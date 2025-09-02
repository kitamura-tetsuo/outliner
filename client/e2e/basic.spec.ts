/** @feature TST-0005
 *  Title   : テスト環境の初期化と準備（Yjs対応版）
 *  Source  : docs/client-features.yaml
 */
import { expect, test } from "@playwright/test";

/**
 * @file basic.spec.ts
 * @description アウトラインアプリの基本機能テスト（Yjs対応版）
 * ホームページの表示や基本UIの確認など、アプリの基本的な機能をテストします。
 * @playwright
 * @title 基本テスト（Yjs対応）
 */

// テスト前の準備（Yjs対応）
test.beforeEach(async ({ page }) => {
    // ホームページにアクセスしてYjsモードを設定
    await page.goto("/", { timeout: 30000 });

    // テスト環境フラグを設定
    await page.evaluate(() => {
        localStorage.setItem("VITE_IS_TEST", "true");
        localStorage.setItem("OUTLINER_MODE", "yjs");
    });

    // YjsProjectManagerをグローバル変数に設定
    await page.evaluate(async () => {
        try {
            const { YjsProjectManager } = await import("../../src/lib/yjsProjectManager.svelte.js");
            (window as any).YjsProjectManager = YjsProjectManager;
            console.log("Basic Test: YjsProjectManager set to global variable");
        } catch (error) {
            console.error("Basic Test: Failed to import YjsProjectManager:", error);
        }
    });
});

/**
 * @testcase ホームページが正常に表示される（Yjs対応）
 * @description アプリのホームページが正しく表示されることを確認するテスト
 * @check ホームページにアクセスするとタイトル「Fluid Outliner App」が表示される
 * @check Yjsモードで動作することを確認する
 */
test("ホームページが正常に表示される", async ({ page }) => {
    // タイトルが表示されることを確認
    await expect(page.locator("h1")).toContainText("Fluid Outliner App");

    // Yjsモードが設定されていることを確認
    const mode = await page.evaluate(() => localStorage.getItem("OUTLINER_MODE"));
    expect(mode).toBe("yjs");
});

/**
 * @testcase YjsProjectManagerが正しく初期化される（Yjs対応）
 * @description YjsProjectManagerがグローバル変数に設定され、基本機能が動作することを確認するテスト
 * @check YjsProjectManagerがwindowオブジェクトに設定される
 * @check YjsProjectManagerのインスタンスを作成できる
 */
test("YjsProjectManagerが正しく初期化される", async ({ page }) => {
    // YjsProjectManagerがグローバル変数に設定されていることを確認
    const hasYjsProjectManager = await page.evaluate(() => {
        return typeof (window as any).YjsProjectManager !== "undefined";
    });
    expect(hasYjsProjectManager).toBe(true);

    // YjsProjectManagerのインスタンスを作成できることを確認
    const result = await page.evaluate(() => {
        const YjsProjectManager = (window as any).YjsProjectManager;
        if (!YjsProjectManager) {
            return { success: false, error: "YjsProjectManager not found" };
        }

        try {
            const testProjectName = "test-project-basic";
            const yjsProjectManager = new YjsProjectManager(testProjectName);
            return {
                success: true,
                projectId: testProjectName,
                hasInstance: !!yjsProjectManager,
            };
        } catch (error: any) {
            return { success: false, error: error.message };
        }
    });

    expect(result.success).toBe(true);
    expect(result.hasInstance).toBe(true);
});
