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

        // Best-effort only: keep teardown short and never fail the test.
        // Do not use Promise.race timeouts here; it doesn't cancel the losing promise and can leak work into the next test.
        try {
            await DataValidationHelpers.trySaveAfterEach(page, testInfo);
        } catch (e: any) {
            console.warn("[afterEach] snapshot skipped:", e?.message ?? e);
        }

        try {
            await DataValidationHelpers.tryCleanupAfterEach(page);
        } catch (e: any) {
            console.warn("[afterEach] cleanup skipped:", e?.message ?? e);
        }
    });
}
