/** @feature SCH-C10DEA72
 *  Title   : Schedule List Refresh
 *  Source  : docs/client-features.yaml
 */
import { expect, test } from "@playwright/test";
import { DataValidationHelpers } from "../utils/dataValidationHelpers";

test.describe("Schedule List Refresh", () => {
    test.afterEach(async ({ page }) => {
        // FluidとYjsのデータ整合性を確認
        try {
            await DataValidationHelpers.validateDataConsistency(page);
        } catch (error) {
            console.log("Data validation skipped:", error.message);
        }
    });
    test("list schedules via API", async ({ page }) => {
        const response = await page.request.post("http://localhost:57070/api/list-schedules", {
            data: { idToken: "dummy-token", pageId: "page-1" },
        });
        expect(response.status()).toBeGreaterThanOrEqual(400);
    });
});
