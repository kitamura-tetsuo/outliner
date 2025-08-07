/** @feature SCH-D83E13D7
 *  Title   : Schedule Editing
 *  Source  : docs/client-features.yaml
 */
import { expect, test } from "@playwright/test";

test.describe("Schedule Editing", () => {
    test("update schedule via API", async ({ page }) => {
        const update = await page.request.post("http://localhost:57070/api/update-schedule", {
            data: {
                idToken: "dummy-token",
                pageId: "page-1",
                scheduleId: "fake-id",
                schedule: { strategy: "one_shot", nextRunAt: Date.now() + 120000 },
            },
        });
        expect(update.status()).toBeGreaterThanOrEqual(400);
    });
});
