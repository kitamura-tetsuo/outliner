import "../utils/registerAfterEachSnapshot";
import { expect, test } from "@playwright/test";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
import { TestHelpers } from "../utils/testHelpers";
registerCoverageHooks();

test.describe("FSE-9d3f2b1c: Firestore store exposes itself to globalThis", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        await TestHelpers.seedProjectAndNavigateForProject(page, testInfo, [], undefined);
    });

    test("firestoreStore is attached to globalThis", async ({ page }) => {
        const exists = await page.evaluate(() => typeof (globalThis as any).__FIRESTORE_STORE__ !== "undefined");
        expect(exists).toBe(true);
    });
});
