import "../utils/registerAfterEachSnapshot";
import { expect, test } from "@playwright/test";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
import { TestHelpers } from "../utils/testHelpers";
registerCoverageHooks();

test.describe("FSE-9d3f2b1c: Firestore store exposes itself to window", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        // Since this test only checks for window.__FIRESTORE_STORE__, we don't need the full app to be ready
        // which can time out if we're not navigating to a valid project page
        await TestHelpers.prepareTestEnvironmentForProject(page, testInfo, [], undefined, { skipAppReady: true });
    });

    test("firestoreStore is attached to window", async ({ page }) => {
        const exists = await page.evaluate(() => typeof (window as any).__FIRESTORE_STORE__ !== "undefined");
        expect(exists).toBe(true);
    });
});
