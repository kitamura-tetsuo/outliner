/** @feature EMU-0001 */
import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

test.describe("EMU-0001: Auth emulator environment variable", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        await TestHelpers.prepareTestEnvironment(page, testInfo, [], false, true);
    });

    test("exposes FIREBASE_AUTH_EMULATOR_HOST", async ({ page }) => {
        await page.goto("/");
        const host = await page.evaluate(() => {
            return window.localStorage.getItem("FIREBASE_AUTH_EMULATOR_HOST") || (window as any).FIREBASE_AUTH_EMULATOR_HOST;
        });
        expect(host).toBe(process.env.FIREBASE_AUTH_EMULATOR_HOST || "localhost:59099");
    });
});
