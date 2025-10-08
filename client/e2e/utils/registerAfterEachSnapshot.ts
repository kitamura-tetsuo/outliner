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
            await DataValidationHelpers.trySaveAfterEach(page, testInfo);
            // Add cleanup to ensure test isolation
            await DataValidationHelpers.tryCleanupAfterEach(page, testInfo);
        })();

        // Race the main operation with the timeout
        await Promise.race([mainPromise, timeoutPromise]);
    });
}
