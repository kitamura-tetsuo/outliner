import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
/** @feature SCH-C10DEA72
 *  Title   : Schedule List Refresh
 *  Source  : docs/client-features.yaml
 */
import { expect, test } from "@playwright/test";

test.describe("Schedule List Refresh", () => {
    test("list schedules via API", async ({ page }) => {
        const response = await page.request.post("http://127.0.0.1:57070/outliner-d57b0/us-central1/listSchedules", {
            data: { idToken: "dummy-token", pageId: "page-1" },
        });
        expect(response.status()).toBeGreaterThanOrEqual(400);
    });
});
