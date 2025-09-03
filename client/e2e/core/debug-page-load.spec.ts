// @ts-nocheck

import { test } from "@playwright/test";

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
                fluidStore: typeof (window as any).__FLUID_STORE__,
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
            // プロジェクト作成を試行
            const projectResult = await page.evaluate(async () => {
                try {
                    const fluidService: any = (window as any).__FLUID_SERVICE__;
                    const projectName = "Debug Project";
                    const client = await fluidService.createNewContainer(projectName);

                    const project = client.getProject();
                    client.createPage("debug-page", ["Debug line 1", "Debug line 2"]);

                    return {
                        success: true,
                        projectTitle: project.title,
                        containerId: client.containerId,
                    };
                } catch (error) {
                    return { success: false, error: error instanceof Error ? error.message : String(error) };
                }
            });

            console.log("Debug: Project result:", projectResult);

            if (projectResult.success) {
                // プロジェクトページに移動
                const projectUrl = `/Debug%20Project/debug-page`;
                console.log("Debug: Navigating to:", projectUrl);

                await page.goto(projectUrl);
                await page.waitForTimeout(2000);

                // プロジェクト読み込みを手動でトリガー
                await page.evaluate(async ({ projectName, pageName }) => {
                    const userManager = (window as any).__USER_MANAGER__;
                    const currentUser = userManager?.getCurrentUser();
                    console.log("Debug: Current user after navigation:", currentUser?.email);

                    if (currentUser) {
                        try {
                            const fluidService: any = (window as any).__FLUID_SERVICE__;
                            const client = await fluidService.getFluidClientByProjectTitle(projectName);

                            const fluidStore = (window as any).__FLUID_STORE__;
                            const generalStore = (window as any).generalStore;
                            if (fluidStore && generalStore) {
                                fluidStore.fluidClient = client;
                                console.log("Debug: FluidClient set in store after navigation");

                                // store.projectが設定されるまで待機
                                let retryCount = 0;
                                while (!generalStore.project && retryCount < 10) {
                                    await new Promise(resolve => setTimeout(resolve, 100));
                                    retryCount++;
                                }

                                // ページを検索して設定
                                if (generalStore.pages && generalStore.pages.current) {
                                    const pages = generalStore.pages.current;
                                    for (let i = 0; i < pages.length; i++) {
                                        const page = pages[i];
                                        if (page.text.toLowerCase() === pageName.toLowerCase()) {
                                            generalStore.currentPage = page;
                                            console.log("Debug: currentPage set:", page.text);
                                            break;
                                        }
                                    }
                                }
                            }
                        } catch (error) {
                            console.error("Debug: Error loading project after navigation:", error);
                        }
                    }
                }, { projectName: "Debug Project", pageName: "debug-page" });

                await page.waitForTimeout(3000);

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
                        fluidStore: (window as any).__FLUID_STORE__
                            ? {
                                hasClient: !!(window as any).__FLUID_STORE__.fluidClient,
                                hasCurrentPage: !!(window as any).__FLUID_STORE__.currentPage,
                            }
                            : null,
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
        }
    });
});
import "../utils/registerAfterEachSnapshot";
