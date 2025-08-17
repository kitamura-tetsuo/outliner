/** @feature TST-c1834f92
 *  Title   : CI environment variable is not exposed to client
 */
import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

test("CI variable is not available in client runtime", async ({ page }, testInfo) => {
    await TestHelpers.prepareTestEnvironment(page, testInfo);
    const value = await page.evaluate(() => {
        return (window as any).CI || (window as any)["import.meta.env"]?.CI;
    });
    expect(value).toBeUndefined();
});
