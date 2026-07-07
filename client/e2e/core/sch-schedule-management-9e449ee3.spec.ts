import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
/** @feature SCH-9E449EE3
 *  Title   : Schedule Management UI
 *  Source  : docs/client-features.yaml
 */
import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

test.describe("Schedule Management", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        await TestHelpers.seedProjectAndNavigate(page, testInfo);
    });

    test("shows newly created schedule", async ({ page }, testInfo) => {
        await TestHelpers.seedProjectAndNavigate(page, testInfo, []);
        const pageId = await TestHelpers.getItemIdByIndex(page, 0);
        const idToken = await page.evaluate(async () => {
            const userManager = (globalThis as any).__USER_MANAGER__;
            return await userManager?.auth?.currentUser?.getIdToken();
        });
        await page.request.post("http://127.0.0.1:57070/outliner-d57b0/us-central1/createSchedule", {
            data: {
                idToken,
                pageId,
                schedule: { strategy: "one_shot", nextRunAt: Date.now() + 60000 },
            },
        });

        const res = await page.request.post(
            `http://127.0.0.1:57070/outliner-d57b0/us-central1/listSchedules`,
            {
                data: { idToken, pageId },
            },
        );
        expect(res.status()).toBe(200);
        const json = await res.json();
        expect(json.schedules.length).toBeGreaterThan(0);
    });
});
