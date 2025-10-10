import "../utils/registerAfterEachSnapshot";
import { expect, test } from "@playwright/test";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
import { TestHelpers } from "../utils/testHelpers";
registerCoverageHooks();

/**
 * Verify that Yjs store exposes connection state.
 */

test.describe("Yjs connection", () => {
    test("store exposes connection state", async ({ page }, testInfo) => {
        await TestHelpers.prepareTestEnvironment(page, testInfo);
        const isDefined = await page.evaluate(() => {
            return typeof (window as any).__YJS_STORE__ !== "undefined";
        });
        expect(isDefined).toBe(true);
        const connected = await page.evaluate(() => {
            const store = (window as any).__YJS_STORE__;
            return store ? store.getIsConnected?.() : undefined;
        });
        expect(typeof connected).toBe("boolean");
    });
});
