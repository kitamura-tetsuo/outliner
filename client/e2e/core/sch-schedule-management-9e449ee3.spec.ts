/** @feature SCH-9E449EE3
 *  Title   : Schedule Management UI
 *  Source  : docs/client-features.yaml
 */
import {
    expect,
    test,
} from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

test.describe("Schedule Management", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        await TestHelpers.prepareTestEnvironment(page, testInfo);
    });

    test("shows newly created schedule", async ({ page }, testInfo) => {
        await TestHelpers.navigateToTestProjectPage(page, testInfo, []);
        const pageId = await TestHelpers.getItemIdByIndex(page, 0);
        const idToken = await page.evaluate(async () => {
            const userManager = (window as any).__USER_MANAGER__;
            return userManager?.auth?.currentUser?.getIdToken();
        });
        await page.request.post("http://localhost:57000/api/create-schedule", {
            data: {
                idToken,
                pageId,
                schedule: { strategy: "one_shot", nextRunAt: Date.now() + 60000 },
            },
        });

        const res = await page.request.post(
            `http://localhost:57000/api/list-schedules`,
            {
                data: { idToken, pageId },
            },
        );
        expect(res.status()).toBe(200);
        const json = await res.json();
        expect(json.schedules.length).toBeGreaterThan(0);
    });
});
