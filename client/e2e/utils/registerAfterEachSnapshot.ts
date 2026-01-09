import { test } from "@playwright/test";
import { DataValidationHelpers } from "./dataValidationHelpers";

// Registers a global afterEach hook to persist a Yjs snapshot for every test.
// Can be disabled by setting E2E_DISABLE_AUTO_SNAPSHOT=1 to minimize side effects.
if (process.env.E2E_DISABLE_AUTO_SNAPSHOT !== "1") {
    test.afterEach(async ({ page }, testInfo) => {
        // Skip snapshot saving for API tests and non-UI tests that don't involve UI interactions
        // Check based on filename as well since API tests might not have "API" in the title
        const isNonUiTest = testInfo.file.includes("api-") || testInfo.title.includes("API-")
            || testInfo.title.includes("管理者チェック") || testInfo.title.includes("admin")
            || testInfo.file.includes("log-rotate") || testInfo.file.includes("server-backup")
            || testInfo.file.includes("-script-") || testInfo.file.includes("-endpoint-");

        if (isNonUiTest) {
            console.log(`[afterEach] Skipping snapshot for non-UI test: ${testInfo.title} in ${testInfo.file}`);
            return;
        }

        // Skip snapshot saving for tests that use browser fixture directly
        // and may not have initialized the page fixture properly
        try {
            if (page.isClosed()) {
                console.log(`[afterEach] Page already closed, skipping snapshot for: ${testInfo.title}`);
                return;
            }
            const url = page.url();
            if (url === "about:blank" || url === "") {
                console.log(`[afterEach] Page not initialized (url=${url}), skipping snapshot for: ${testInfo.title}`);
                return;
            }
        } catch (e: any) {
            console.log(`[afterEach] Page not accessible, skipping snapshot for: ${testInfo.title}`, e?.message);
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
                }, 20000)
            );

            // Race save operation with a 20 second timeout
            await Promise.race([savePromise, saveTimeout]);

            // Add cleanup to ensure test isolation
            const cleanupPromise = DataValidationHelpers.tryCleanupAfterEach(page);
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
