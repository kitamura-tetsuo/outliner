import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

test.describe("FSE-9d3f2b1c: Firestore store exposes itself to window", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        await TestHelpers.prepareTestEnvironmentForProject(page, testInfo, [], undefined);
    });

    test("firestoreStore is attached to window", async ({ page }) => {
        const exists = await page.evaluate(() => typeof (window as any).__FIRESTORE_STORE__ !== "undefined");
        expect(exists).toBe(true);
    });
});
import "../utils/registerAfterEachSnapshot";
