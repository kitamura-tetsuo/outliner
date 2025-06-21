/** @feature SEC-0001
 *  Title   : Dotenvx encrypted env files
 *  Source  : docs/client-features.yaml
 */
import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

test.describe("SEC-0001: Dotenvx encrypted env files", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        await TestHelpers.prepareTestEnvironment(page, testInfo);
    });

    test("Environment variables are loaded", async ({ page }) => {
        await expect(page.locator("body")).toBeVisible();
        expect(process.env.VITE_IS_TEST).toBe("true");
    });
});
