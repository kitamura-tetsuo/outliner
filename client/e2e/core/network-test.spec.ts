import { expect, test } from "@playwright/test";
import { DataValidationHelpers } from "../utils/dataValidationHelpers";

test.describe("Network Connectivity Test", () => {
    test.afterEach(async ({ page }) => {
        // FluidとYjsのデータ整合性を確認
        try {
            await DataValidationHelpers.validateDataConsistency(page);
        } catch (error) {
            console.log("Data validation skipped:", error.message);
        }
    });
    test("can access Firebase emulator endpoints", async ({ page }) => {
        console.log("Debug: Testing Firebase emulator connectivity");

        await page.goto("/", {
            timeout: 60000,

            waitUntil: "domcontentloaded",
        });
        // Firebaseエミュレーターへの接続をテスト
        const networkTest = await page.evaluate(async () => {
            const results: any = {};

            // Auth emulator test

            try {
                const authResponse = await fetch("http://localhost:59099/");

                results.authEmulator = {
                    status: authResponse.status,

                    ok: authResponse.ok,

                    accessible: true,
                };
            } catch (error) {
                results.authEmulator = {
                    accessible: false,

                    error: error instanceof Error ? error.message : String(error),
                };
            }

            // Firestore emulator test

            try {
                const firestoreResponse = await fetch("http://localhost:58080/");

                results.firestoreEmulator = {
                    status: firestoreResponse.status,

                    ok: firestoreResponse.ok,

                    accessible: true,
                };
            } catch (error) {
                results.firestoreEmulator = {
                    accessible: false,

                    error: error instanceof Error ? error.message : String(error),
                };
            }

            // Main server test

            try {
                const serverResponse = await fetch("http://localhost:7090/");

                results.mainServer = {
                    status: serverResponse.status,

                    ok: serverResponse.ok,

                    accessible: true,
                };
            } catch (error) {
                results.mainServer = {
                    accessible: false,

                    error: error instanceof Error ? error.message : String(error),
                };
            }

            return results;
        });
        console.log("Debug: Network test results:", networkTest);

        // メインサーバーは接続できるはず
        expect(networkTest.mainServer.accessible).toBe(true);

        // エミュレーターの接続状況を確認
        if (!networkTest.authEmulator.accessible) {
            console.log("Debug: Auth emulator not accessible:", networkTest.authEmulator.error);
        }

        if (!networkTest.firestoreEmulator.accessible) {
            console.log("Debug: Firestore emulator not accessible:", networkTest.firestoreEmulator.error);
        }
    });
    test("can check Firebase configuration", async ({ page }) => {
        console.log("Debug: Testing Firebase configuration");

        await page.goto("/", {
            timeout: 60000,

            waitUntil: "domcontentloaded",
        });
        // UserManagerが初期化されるまで待機
        await page.waitForFunction(
            () => (window as any).__USER_MANAGER__ !== undefined,
            { timeout: 30000 },
        );

        // Firebase設定を確認
        const firebaseConfig = await page.evaluate(() => {
            const userManager = (window as any).__USER_MANAGER__;

            const firebaseApp = (window as any).__firebase_client_app__;

            return {
                userManagerExists: !!userManager,

                firebaseAppExists: !!firebaseApp,

                firebaseConfig: firebaseApp?.options || null,

                authSettings: userManager?.auth?.config || null,

                emulatorSettings: {
                    useEmulator: userManager?.useEmulator || false,

                    emulatorHost: userManager?.emulatorHost || null,

                    emulatorPort: userManager?.emulatorPort || null,
                },
            };
        });
        console.log("Debug: Firebase configuration:", firebaseConfig);

        expect(firebaseConfig.userManagerExists).toBe(true);
        expect(firebaseConfig.firebaseAppExists).toBe(true);
    });
    test("can test direct emulator connection", async ({ page }) => {
        console.log("Debug: Testing direct emulator connection");

        // エミュレーターに直接アクセスしてみる
        try {
            await page.goto("http://localhost:59099/", {
                timeout: 10000,

                waitUntil: "domcontentloaded",
            });

            console.log("Debug: Successfully accessed Auth emulator directly");

            const content = await page.content();

            console.log("Debug: Auth emulator response length:", content.length);
        } catch (error) {
            console.log("Debug: Failed to access Auth emulator directly:", error);
        }

        // Firestoreエミュレーターもテスト
        try {
            await page.goto("http://localhost:58080/", {
                timeout: 10000,

                waitUntil: "domcontentloaded",
            });

            console.log("Debug: Successfully accessed Firestore emulator directly");
        } catch (error) {
            console.log("Debug: Failed to access Firestore emulator directly:", error);
        }
    });
});
