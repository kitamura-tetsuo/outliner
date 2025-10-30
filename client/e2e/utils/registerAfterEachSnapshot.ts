import { test } from "@playwright/test";
import { DataValidationHelpers } from "./dataValidationHelpers";

// Registers a global afterEach hook to persist a Yjs snapshot for every test.
// Can be disabled by setting E2E_DISABLE_AUTO_SNAPSHOT=1 to minimize side effects.
if (process.env.E2E_DISABLE_AUTO_SNAPSHOT !== "1") {
    test.afterEach(async ({ page }, testInfo) => {
        // Skip snapshot saving for API tests that don't involve UI interactions
        // Check based on filename as well since API tests might not have "API" in the title
        const isApiTest = testInfo.file.includes("api-") || testInfo.title.includes("API-")
            || testInfo.title.includes("管理者チェック") || testInfo.title.includes("admin");

        if (isApiTest) {
            console.log(`[afterEach] Skipping snapshot for API test: ${testInfo.title} in ${testInfo.file}`);
            return;
        }

        // Execute with a timeout to prevent hanging
        const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => reject(new Error("afterEach hook timeout")), 30000); // 30 second timeout
        });

        const mainPromise = (async () => {
            // Run save and cleanup with individual timeouts to prevent hanging
            const savePromise = DataValidationHelpers.trySaveAfterEach(page, testInfo);
            const saveTimeout = new Promise(resolve =>
                setTimeout(() => {
                    console.log("[afterEach] Save operation timeout");
                    resolve(undefined);
                }, 5000)
            );

            // Race save operation with a 5 second timeout
            await Promise.race([savePromise, saveTimeout]);

            // Add cleanup to ensure test isolation
            const cleanupPromise = DataValidationHelpers.tryCleanupAfterEach(page, testInfo);
            const cleanupTimeout = new Promise(resolve =>
                setTimeout(() => {
                    console.log("[afterEach] Cleanup operation timeout");
                    resolve(undefined);
                }, 5000)
            );

            // Race cleanup operation with a 5 second timeout
            await Promise.race([cleanupPromise, cleanupTimeout]);
        })();

        // Race the main operation with the timeout
        await Promise.race([mainPromise, timeoutPromise]);
    });
}
