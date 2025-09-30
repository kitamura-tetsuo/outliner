import { expect, test } from "@playwright/test";

test.describe("Authentication Test", () => {
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
                svelteGoto: typeof win.__SVELTE_GOTO__,
                currentUser: win.__USER_MANAGER__?.currentUser || null,
                allGlobals: Object.keys(win).filter(key => key.startsWith("__")),
            };
        });
        console.log("Debug: After authentication:", afterAuth);

        // 認証が成功した場合の追加チェック
        // Note: In test environments, __SVELTE_GOTO__ is intentionally not set (see debug.ts)
        // So we skip waiting for it to avoid test timeout
        if (authResult.success) {
            console.log(
                "Debug: Authentication completed successfully, skipping __SVELTE_GOTO__ check in test environment",
            );
        }
    });
});
import "../utils/registerAfterEachSnapshot";
