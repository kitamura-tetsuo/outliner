import "../utils/registerAfterEachSnapshot";
import { expect, test } from "@playwright/test";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
import { TestHelpers } from "../utils/testHelpers";
registerCoverageHooks();

test.describe("Page Route Debug", () => {
    test("debug page route loading process", async ({ page }) => {
        console.log("Debug: Starting page route debug test");

        // コンソールログをキャプチャ
        const logs: string[] = [];
        page.on("console", msg => {
            logs.push(`[${msg.type()}] ${msg.text()}`);
        });

        // ホームページにアクセス
        await page.goto("/");

        // テスト環境フラグを設定
        await page.evaluate(() => {
            localStorage.setItem("VITE_IS_TEST", "true");
            localStorage.setItem("VITE_USE_FIREBASE_EMULATOR", "true");
        });

        await page.reload();

        // UserManagerの初期化を待機
        await page.waitForFunction(() => (window as any).__USER_MANAGER__ !== undefined, { timeout: 30000 });

        // 認証を実行
        const authResult = await page.evaluate(async () => {
            const userManager = (window as any).__USER_MANAGER__;
            return await userManager.signInWithEmailAndPassword("test@example.com", "password123");
        });

        console.log("Debug: Authentication result:", authResult);

        // グローバル変数の設定を待機
        await page.waitForFunction(() => {
            return (window as any).__SVELTE_GOTO__;
        }, { timeout: 30000 });

        // プロジェクトとページを作成
        const projectName = `Debug Project ${Date.now()}`;
        const pageName = `debug-page-${Date.now()}`;

        await TestHelpers.createAndSeedProject(page, null, [], { projectName, pageName });

        // ページルートに移動
        const encodedProject = encodeURIComponent(projectName);
        const encodedPage = encodeURIComponent(pageName);
        const url = `/${encodedProject}/${encodedPage}`;

        console.log("Debug: Navigating to:", url);
        await page.goto(url);

        // ページの状態を定期的にチェック
        for (let i = 0; i < 30; i++) {
            const state = await page.evaluate((i) => {
                const generalStore = (window as any).generalStore;

                return {
                    iteration: i as number,
                    hasGeneralStore: !!generalStore,
                    hasProject: !!(generalStore?.project),
                    hasPages: !!(generalStore?.pages),
                    hasCurrentPage: !!(generalStore?.currentPage),
                    pagesCount: generalStore?.pages?.current?.length || 0,
                    currentPageText: generalStore?.currentPage?.text || "none",
                    projectTitle: generalStore?.project?.title || "none",
                    outlinerBaseExists: !!document.querySelector('[data-testid="outliner-base"]'),
                    pageTitle: document.title,
                    url: window.location.href,
                };
            }, i);

            console.log(`Debug iteration ${i}:`, state);

            // 条件が満たされたら終了
            if (state.hasProject && state.hasPages && state.hasCurrentPage) {
                console.log("Debug: All conditions met!");
                break;
            }

            await page.waitForTimeout(2000); // 2秒待機
        }

        // 最終状態を確認
        const finalState = await page.evaluate(() => {
            const generalStore = (window as any).generalStore;

            return {
                hasGeneralStore: !!generalStore,
                hasProject: !!(generalStore?.project),
                hasPages: !!(generalStore?.pages),
                hasCurrentPage: !!(generalStore?.currentPage),
                pagesCount: generalStore?.pages?.current?.length || 0,
                currentPageText: generalStore?.currentPage?.text || "none",
                projectTitle: generalStore?.project?.title || "none",
                outlinerBaseExists: !!document.querySelector('[data-testid="outliner-base"]'),
            };
        });

        console.log("Debug: Final state:", finalState);

        // キャプチャしたコンソールログを出力
        console.log("Debug: Browser console logs:");
        logs.forEach((log, index) => {
            console.log(`  ${index}: ${log}`);
        });

        // テストは常に成功とする（デバッグ目的）
        expect(true).toBe(true);
    });
});
