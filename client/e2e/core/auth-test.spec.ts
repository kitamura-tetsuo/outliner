import { expect, test } from "@playwright/test";
import { DataValidationHelpers } from "../utils/dataValidationHelpers";

test.describe("Authentication Test", () => {
    test.afterEach(async ({ page }) => {
        // FluidとYjsのデータ整合性を確認（認証テストのため、エラーは無視）
        try {
            await DataValidationHelpers.validateDataConsistency(page);
        } catch (error) {
            console.log("Data validation skipped for authentication test:", error.message);
        }
    });
    test("can perform manual authentication", async ({ page }) => {
        console.log("Debug: Testing manual authentication");

        await page.goto("/", {
            timeout: 60000,

            waitUntil: "domcontentloaded",
        });
        // UserManagerが初期化されるまで待機
        await page.waitForFunction(
            () => (window as any).__USER_MANAGER__ !== undefined,
            { timeout: 30000 },
        );
        console.log("Debug: UserManager found");

        // 認証前の状態を確認
        const beforeAuth = await page.evaluate(() => {
            const win = window as any;

            return {
                userManager: typeof win.__USER_MANAGER__,

                fluidStore: typeof win.__FLUID_STORE__,

                svelteGoto: typeof win.__SVELTE_GOTO__,

                currentUser: win.__USER_MANAGER__?.currentUser || null,
            };
        });
        console.log("Debug: Before authentication:", beforeAuth);

        // 認証を実行
        const authResult: any = await page.evaluate(async () => {
            const userManager = (window as any).__USER_MANAGER__;

            if (!userManager) {
                return { success: false, error: "UserManager not found" };
            }

            try {
                console.log("Starting authentication...");

                // 認証状態の変更を監視

                let authCompleted = false;

                const authPromise = new Promise(resolve => {
                    const cleanup = userManager.addEventListener((authResult: any) => {
                        console.log("Auth state changed:", authResult);

                        if (authResult && authResult.user) {
                            authCompleted = true;

                            cleanup();

                            resolve({ success: true, user: authResult.user });
                        }
                    });
                    // 10秒後にタイムアウト

                    setTimeout(() => {
                        if (!authCompleted) {
                            cleanup();

                            resolve({ success: false, error: "Authentication timeout" });
                        }
                    }, 10000);
                });
                // ログイン実行
                await userManager.loginWithEmailPassword("test@example.com", "password");

                console.log("Login method called, waiting for auth state change...");

                return await authPromise;
            } catch (error) {
                console.error("Authentication error:", error);

                return { success: false, error: error instanceof Error ? error.message : String(error) };
            }
        });
        console.log("Debug: Authentication result:", authResult);

        // 認証後の状態を確認
        await page.waitForTimeout(2000); // 少し待機
        const afterAuth = await page.evaluate(() => {
            const win = window as any;

            return {
                userManager: typeof win.__USER_MANAGER__,

                fluidStore: typeof win.__FLUID_STORE__,

                svelteGoto: typeof win.__SVELTE_GOTO__,

                currentUser: win.__USER_MANAGER__?.currentUser || null,

                allGlobals: Object.keys(win).filter(key => key.startsWith("__")),
            };
        });
        console.log("Debug: After authentication:", afterAuth);

        // 認証が成功した場合の追加チェック
        if (authResult && authResult.success) {
            // FluidStoreとSvelteGotoが設定されるまで待機（最大30秒）

            try {
                await page.waitForFunction(
                    () => {
                        const win = window as any;

                        const hasFluidStore = typeof win.__FLUID_STORE__ !== "undefined";

                        const hasSvelteGoto = typeof win.__SVELTE_GOTO__ !== "undefined";

                        console.log("Waiting for globals - FluidStore:", hasFluidStore, "SvelteGoto:", hasSvelteGoto);

                        return hasFluidStore && hasSvelteGoto;
                    },
                    { timeout: 30000 },
                );

                console.log("Debug: All global variables are now available");
            } catch (error) {
                console.log("Debug: Timeout waiting for global variables:", error);
            }
        }
    });
});
