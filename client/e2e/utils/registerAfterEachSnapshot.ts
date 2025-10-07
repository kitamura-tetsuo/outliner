import { test } from "@playwright/test";
import { DataValidationHelpers } from "./dataValidationHelpers";

// Registers a global afterEach hook to persist a Yjs snapshot for every test.
// Can be disabled by setting E2E_DISABLE_AUTO_SNAPSHOT=1 to minimize side effects.
if (false) {
    test.afterEach(async ({ page }, testInfo) => {
        await DataValidationHelpers.trySaveAfterEach(page, testInfo);
    });
}
