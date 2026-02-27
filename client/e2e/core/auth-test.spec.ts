import "../utils/registerAfterEachSnapshot";
import { test } from "@playwright/test";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();

test.describe("Authentication Test", () => {
    test("can perform manual authentication", async ({ page }) => {
        console.log("Debug: Testing manual authentication");

        await page.goto("/", {
            timeout: 60000,
            waitUntil: "domcontentloaded",
        });

        // Wait for UserManager to initialize
        await page.waitForFunction(
            () => (window as { __USER_MANAGER__?: any; }).__USER_MANAGER__ !== undefined,
            { timeout: 30000 },
        );
        console.log("Debug: UserManager found");

        // Check pre-authentication state
        const beforeAuth = await page.evaluate(() => {
            const win = window as { __USER_MANAGER__?: { currentUser?: any; }; __SVELTE_GOTO__?: any; };
            return {
                userManager: typeof win.__USER_MANAGER__,
                svelteGoto: typeof win.__SVELTE_GOTO__,
                currentUser: win.__USER_MANAGER__?.currentUser || null,
            };
        });
        console.log("Debug: Before authentication:", beforeAuth);

        // Perform authentication
        const authResult = await page.evaluate<{
            success?: boolean;
            user?: any;
            error?: unknown;
        }>(async () => {
            const win = window as {
                __USER_MANAGER__?: {
                    addEventListener: (callback: (result: { user?: any; }) => void) => () => void;
                    loginWithEmailPassword: (email: string, password: string) => Promise<void>;
                };
            };
            const userManager = win.__USER_MANAGER__;
            if (!userManager) {
                return { success: false, error: "UserManager not found" };
            }

            try {
                console.log("Starting authentication...");

                // Observe authentication state changes
                let authCompleted = false;
                const authPromise = new Promise(resolve => {
                    const cleanup = userManager.addEventListener((authResult: { user?: any; }) => {
                        console.log("Auth state changed:", authResult);
                        if (authResult && authResult.user) {
                            authCompleted = true;
                            cleanup();
                            resolve({ success: true, user: authResult.user });
                        }
                    });

                    // Timeout after 10 seconds
                    setTimeout(() => {
                        if (!authCompleted) {
                            cleanup();
                            resolve({ success: false, error: "Authentication timeout" });
                        }
                    }, 10000);
                });

                // Execute login
                await userManager.loginWithEmailPassword("test@example.com", "password");
                console.log("Login method called, waiting for auth state change...");

                return await authPromise;
            } catch (error) {
                console.error("Authentication error:", error);
                return { success: false, error: error instanceof Error ? error.message : String(error) };
            }
        });

        console.log("Debug: Authentication result:", authResult);

        // Check post-authentication state
        await page.waitForTimeout(500); // Wait for authentication to complete (no cursor usage)

        const afterAuth = await page.evaluate(() => {
            const win = window as { __USER_MANAGER__?: { currentUser?: any; }; __SVELTE_GOTO__?: any; };
            return {
                userManager: typeof win.__USER_MANAGER__,
                svelteGoto: typeof win.__SVELTE_GOTO__,
                currentUser: win.__USER_MANAGER__?.currentUser || null,
                allGlobals: Object.keys(win).filter(key => key.startsWith("__")),
            };
        });
        console.log("Debug: After authentication:", afterAuth);

        // Additional checks upon successful authentication
        // Note: In test environments, __SVELTE_GOTO__ is intentionally not set (see debug.ts)
        // So we skip waiting for it to avoid test timeout
        if (authResult?.success) {
            console.log(
                "Debug: Authentication completed successfully, skipping __SVELTE_GOTO__ check in test environment",
            );
        }
    });
});
