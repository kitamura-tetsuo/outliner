/** @feature FTR-5d1c8a37 */
import "../utils/registerAfterEachSnapshot";
import { expect, test } from "@playwright/test";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();

// FTR-5d1c8a37 (issue #5012): a Schedule is a project-level entity. The demo's
// routine rules read `routine_templates` and write `routine_occurrences`, so
// both tables list the same two schedules — as references, with no owner.
test.describe("Schedules are referenced by tables, not owned by them", () => {
    test("the table a rule writes to reports it as a write reference", async ({ page }) => {
        await page.goto("/tables/demo/demo-table-routine-occurrences");

        const references = page.getByTestId("table-schedule-references");
        await expect(references).toBeVisible({ timeout: 30000 });

        const daily = references.locator("[data-schedule-id='demo-rule-daily-routines']");
        await expect(daily).toBeVisible({ timeout: 30000 });
        await expect(daily).toHaveAttribute("href", "/schedules/demo/demo-rule-daily-routines");
        await expect(references.locator("[data-reference-kind='write-target']").first()).toBeVisible();
    });

    test("the table a rule only reads reports the same rule as a read reference", async ({ page }) => {
        await page.goto("/tables/demo/demo-table-routine-templates");

        const references = page.getByTestId("table-schedule-references");
        await expect(references).toBeVisible({ timeout: 30000 });

        const daily = references.locator("[data-schedule-id='demo-rule-daily-routines']");
        await expect(daily).toBeVisible({ timeout: 30000 });
        await expect(references.locator("[data-reference-kind='sql-reference']").first()).toBeVisible();
        // The reference list is explicitly "used by", never a child list.
        await expect(references).toContainText("Schedules belong to the project");
    });
});
