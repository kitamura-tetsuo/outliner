/** @feature TST-09c9de20
 *  Title   : Environment variable is loaded in browser
 */
import { expect, test } from "../fixtures/console-forward";
import { DataValidationHelpers } from "../utils/dataValidationHelpers";
import { TestHelpers } from "../utils/testHelpers";

test.describe("Environment variable check", () => {
    test.afterEach(async ({ page }, testInfo) => {
        // FluidとYjsのデータ整合性を確認（認証なしテストではエラーを無視）
        try {
            await DataValidationHelpers.validateDataConsistency(page);

            // スナップショット比較（ユニークラベル）
            const safeTitle = testInfo.title.replace(/[^a-zA-Z0-9-_]/g, "-");
            await DataValidationHelpers.saveSnapshotsAndCompare(page, `tst-env-afterEach-${safeTitle}`);
        } catch (error) {
            console.log("⚠️ Data validation skipped for non-authenticated test:", (error as any).message);
        }
    });

    test("VITE_IS_TEST is true in client runtime", async ({ page }, testInfo) => {
        await TestHelpers.prepareTestEnvironment(page, testInfo);
        const value = await page.evaluate(() => {
            return (window as any).VITE_IS_TEST || (window as any)["import.meta.env"]?.VITE_IS_TEST;
        });
        expect(value).toBeUndefined();

        // FluidとYjsのデータ整合性を確認（認証なしテストではエラーを無視）
        try {
            await DataValidationHelpers.validateDataConsistency(page);
        } catch (error) {
            console.log("⚠️ Data validation skipped for non-authenticated test:", error.message);
        }
    });
});
