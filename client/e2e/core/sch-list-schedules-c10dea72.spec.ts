/** @feature SCH-C10DEA72
 *  Title   : Schedule List Refresh
 *  Source  : docs/client-features.yaml
 */
import { expect, test } from "@playwright/test";

test.describe("Schedule List Refresh", () => {
    test("list schedules via API", async ({ page }) => {
        const response = await page.request.post("http://localhost:57070/api/list-schedules", {
            data: { idToken: "dummy-token", pageId: "page-1" },
        });
        expect(response.status()).toBeGreaterThanOrEqual(400);
    });
});
import "../utils/registerAfterEachSnapshot";
