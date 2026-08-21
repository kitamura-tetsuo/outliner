/** @feature TBL-3950a1b2 */
import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

/**
 * Creates a table in the seeded project and returns the project's URL segment.
 * A schedule needs some table to write into; picking one does not make that
 * table the schedule's owner (issue #5012).
 */
async function seedTableAndOpenSchedules(page: import("@playwright/test").Page): Promise<string> {
    const item = page.locator(".outliner-item").last();
    await item.locator(".item-content").click({ force: true });

    const addDatabaseBtn = page.locator(".add-database-btn").first();
    await expect(addDatabaseBtn).toBeVisible({ timeout: 10000 });
    await addDatabaseBtn.click();

    const tableBlock = page.locator("[data-testid='yjs-table-block']").first();
    await expect(tableBlock).toBeVisible();
    await page.waitForSelector("[data-testid='yjs-table-create-panel']");
    await page.click("[data-testid='yjs-table-create']");
    await expect(tableBlock.locator("[data-testid='yjs-table-toggle-grid']")).toBeVisible();

    const projectSegment = new URL(page.url()).pathname.split("/")[1];
    await page.goto(`/schedules/${projectSegment}`);
    await expect(page.getByTestId("project-schedule-list")).toBeVisible({ timeout: 30000 });
    return projectSegment;
}

test.describe("Schedule Rule Run Now", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        await TestHelpers.seedProjectAndNavigate(page, testInfo);
        await TestHelpers.waitForOutlinerItems(page, 1);
    });

    test("should allow running a schedule rule immediately", async ({ page }) => {
        const projectSegment = await seedTableAndOpenSchedules(page);

        await page.getByTestId("project-schedule-create").click();
        await expect(page).toHaveURL(new RegExp(`/schedules/${projectSegment}/[^/]+$`), { timeout: 15000 });

        await page.goto(`/schedules/${projectSegment}`);
        const list = page.getByTestId("project-schedule-list");
        const ruleItem = list.locator(".schedule-rule-list li").first();
        await ruleItem.waitFor({ state: "visible", timeout: 30000 });

        const runNowBtn = ruleItem.locator("[data-testid='schedule-rule-run-now']");
        await runNowBtn.waitFor({ state: "visible" });

        await page.route("**/api/schedules/run-now", async route => {
            setTimeout(async () => {
                const json = { ok: true };
                await route.fulfill({ json });
            }, 500);
        });

        await runNowBtn.click();

        // Ensure "Running..." appears while the request is in flight
        await expect(runNowBtn).toHaveText("Running…", { timeout: 5000 });
        await expect(runNowBtn).toBeDisabled();

        // Once the request resolves successfully the button becomes usable again
        // and no inline error is shown. The "(OK)" badge is driven by the
        // lastRunStatus the server writes back into the Yjs schedules map, which
        // the mocked endpoint above never performs; that path is covered by
        // ScheduleRuleList.test.ts and server/tests/scheduler/scheduler-run-now.test.ts.
        await expect(runNowBtn).toHaveText("Run now", { timeout: 15000 });
        await expect(runNowBtn).toBeEnabled();
        await expect(list.locator(".bg-red-50.border-red-100")).toHaveCount(0);
    });

    test("should display inline error on invalid SQL", async ({ page }) => {
        const projectSegment = await seedTableAndOpenSchedules(page);

        await page.getByTestId("project-schedule-create").click();
        await expect(page).toHaveURL(new RegExp(`/schedules/${projectSegment}/[^/]+$`), { timeout: 15000 });

        await page.goto(`/schedules/${projectSegment}`);
        const list = page.getByTestId("project-schedule-list");
        const ruleItem = list.locator(".schedule-rule-list li").first();
        await ruleItem.waitFor({ state: "visible", timeout: 30000 });

        // Mock the run-now endpoint to return an error specifically for this test
        await page.route("**/api/schedules/run-now", async route => {
            const json = { ok: false, error: "syntax error at or near INVALID SQL" };
            await route.fulfill({ json });
        });

        const runNowBtn = ruleItem.locator("[data-testid='schedule-rule-run-now']");
        await runNowBtn.waitFor({ state: "visible" });
        await runNowBtn.click();

        const errorBox = list.locator(".bg-red-50.border-red-100");
        await expect(errorBox).toBeVisible({ timeout: 15000 });
        await expect(errorBox).toContainText("syntax error at or near");
    });
});
