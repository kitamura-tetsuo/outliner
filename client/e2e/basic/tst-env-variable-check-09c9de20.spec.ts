import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
/** @feature TST-09c9de20
 *  Title   : Environment variable is loaded in browser
 */
import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

test("VITE_IS_TEST is true in client runtime", async ({ page }, testInfo) => {
    await TestHelpers.prepareTestEnvironment(page, testInfo);
    const value = await page.evaluate(() => {
        return (window as any).VITE_IS_TEST || (window as any)["import.meta.env"]?.VITE_IS_TEST;
    });
    expect(value).toBeUndefined();
});
