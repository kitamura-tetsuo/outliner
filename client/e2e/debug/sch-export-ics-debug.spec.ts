import { expect, test } from "@playwright/test";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
import { TestHelpers } from "../utils/testHelpers";
registerCoverageHooks();

// Debug-only spec to probe schedule creation/listing before visiting UI
// Not intended to be committed; used for local diagnosis

test("debug: create and list schedules before UI", async ({ page }, testInfo) => {
    const env = await TestHelpers.prepareTestEnvironment(page, testInfo);
    const projectName = env.projectName;
    const pageName = env.pageName;
    const pageId = (await TestHelpers.getItemIdByIndex(page, 0)) ?? "";
    expect(pageId).not.toEqual("");

    const idToken = await page.evaluate(async () => {
        const userManager = (window as any).__USER_MANAGER__;
        return await userManager?.auth?.currentUser?.getIdToken();
    });
    expect(idToken).toBeTruthy();

    const nextRunAt = Date.now() + 10 * 60 * 1000;

    const createRes = await page.request.post("http://localhost:57070/api/create-schedule", {
        data: { idToken, pageId, schedule: { strategy: "one_shot", nextRunAt } },
    });
    console.log("create status:", createRes.status());
    expect(createRes.status()).toBe(200);

    const listRes = await page.request.post("http://localhost:57070/api/list-schedules", {
        data: { idToken, pageId },
    });
    console.log("list status:", listRes.status());
    const json = await listRes.json();
    console.log("list body:", json);
    expect(listRes.status()).toBe(200);
    expect(json?.schedules?.length ?? 0).toBeGreaterThan(0);

    const scheduleUrl = `http://localhost:7090/${encodeURIComponent(projectName)}/${
        encodeURIComponent(pageName)
    }/schedule`;
    await page.goto(scheduleUrl, { waitUntil: "domcontentloaded" });

    // Print the ScheduleDebug content if present
    const dbg = page.locator('[data-testid="schedule-debug"]');
    console.log("schedule-debug:", await dbg.textContent());
});
