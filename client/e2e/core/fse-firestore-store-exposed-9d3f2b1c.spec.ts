import "../utils/registerAfterEachSnapshot";
import { expect, test } from "@playwright/test";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
import { TestHelpers } from "../utils/testHelpers";
registerCoverageHooks();

test.describe("FSE-9d3f2b1c: Firestore store exposes itself to window", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        await TestHelpers.prepareTestEnvironmentForProject(page, testInfo);
    });

    test("firestoreStore is attached to window", async ({ page }) => {
        const exists = await page.evaluate(() => typeof (window as any).__FIRESTORE_STORE__ !== "undefined");
        expect(exists).toBe(true);
    });
});
