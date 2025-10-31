import "../utils/registerAfterEachSnapshot";
registerCoverageHooks();

import { test } from "@playwright/test";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";

test.describe("Debug Page Load", () => {
    test("debug page loading process", async ({ page }) => {
        console.log("Debug: Starting page load test");

        // ホームページに移動
        await page.goto("/", { timeout: 60000 });
        console.log("Debug: Navigated to home page");

        // 基本的な要素の確認
        await page.waitForTimeout(3000);

        // ページの状態を確認
        const pageState = await page.evaluate(() => {
            return {
                readyState: document.readyState,
                title: document.title,
                bodyLength: document.body.innerHTML.length,
                userManager: typeof (window as any).__USER_MANAGER__,
                svelteGoto: typeof (window as any).__SVELTE_GOTO__,
            };
        });

        console.log("Debug: Page state:", pageState);

        // 認証を試行
        const authResult = await page.evaluate(async () => {
            try {
                const userManager = (window as any).__USER_MANAGER__;
                if (!userManager) {
                    return { success: false, error: "UserManager not found" };
                }

                await userManager.loginWithEmailPassword("test@example.com", "password");
                return { success: true, user: userManager.getCurrentUser() };
            } catch (error) {
                return { success: false, error: error instanceof Error ? error.message : String(error) };
            }
        });

        console.log("Debug: Auth result:", authResult);

        if (authResult.success) {
            // Yjs デモページでプロジェクトを初期化
            await page.goto("/yjs-outliner");
            await page.waitForFunction(() => {
                const gs: any = (window as any).generalStore;
                return !!(gs && gs.project);
            }, { timeout: 15000 });

            // テスト用ページを追加して選択
            await page.evaluate(() => {
                const gs: any = (window as any).generalStore;
                const page = gs.project.addPage("debug-page", "tester");
                page.items.addNode("tester").updateText("Debug line 1");
                page.items.addNode("tester").updateText("Debug line 2");
                gs.currentPage = page;
            });
            // ページの最終状態を確認
            const finalState = await page.evaluate(() => {
                const generalStore = (window as any).generalStore;
                return {
                    url: window.location.href,
                    outlinerBase: !!document.querySelector('[data-testid="outliner-base"]'),
                    outlinerItems: document.querySelectorAll(".outliner-item").length,
                    addButton: !!Array.from(document.querySelectorAll("button")).find(btn =>
                        btn.textContent?.includes("アイテム追加")
                    ),
                    generalStore: generalStore
                        ? {
                            hasProject: !!generalStore.project,
                            hasPages: !!generalStore.pages,
                            hasCurrentPage: !!generalStore.currentPage,
                            pagesCount: generalStore.pages?.current?.length || 0,
                        }
                        : null,
                };
            });

            console.log("Debug: Final state:", finalState);

            // スクリーンショットを保存
            await page.screenshot({ path: "test-results/debug-final-state.png" });
        }
    });
});
