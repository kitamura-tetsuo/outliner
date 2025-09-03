import { test } from "@playwright/test";
import { DataValidationHelpers } from "./dataValidationHelpers";

// Registers a global afterEach hook to persist a Yjs snapshot for every test.
// Import this file once at the top of a spec to enable snapshot capture.
test.afterEach(async ({ page }, testInfo) => {
    await DataValidationHelpers.trySaveAfterEach(page, testInfo);
});
