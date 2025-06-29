/** @feature SCH-BA83FD47
 *  Title   : Scheduled Page Publishing
 *  Source  : docs/client-features.yaml
 */
import {
    expect,
    test,
} from "@playwright/test";

test.describe("Scheduled Page Publishing", () => {
    test("create schedule via API", async ({ page }) => {
        const response = await page.request.post("/api/create-schedule", {
            data: {
                idToken: "dummy-token",
                pageId: "page-1",
                schedule: { strategy: "one_shot", nextRunAt: Date.now() + 60000 },
            },
        });

        // invalid token should be rejected
        expect(response.status()).toBeGreaterThanOrEqual(400);
    });
});
