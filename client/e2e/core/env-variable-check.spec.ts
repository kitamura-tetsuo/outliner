/** @feature TST-0006
 *  Title   : Environment variable is loaded in browser
 */
import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

test.skip("VITE_IS_TEST is true in client runtime", async ({ page }, testInfo) => {
    await TestHelpers.prepareTestEnvironment(page, testInfo);
    const value = await page.evaluate(() => {
        return (window as any).VITE_IS_TEST || (window as any)["import.meta.env"]?.VITE_IS_TEST;
    });
    expect(value).toBe("true");
});
import "../utils/registerAfterEachSnapshot";
