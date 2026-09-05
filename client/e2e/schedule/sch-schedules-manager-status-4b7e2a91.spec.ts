/** @feature FTR-4b7e2a91 */
import "../utils/registerAfterEachSnapshot";
import { expect, test } from "@playwright/test";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();

// FTR-4b7e2a91 (issue #5290): the Schedules Manager. The demo project seeds two
// recurring Schedules, and the production server indexes them and mirrors its
// own recurrence cursor into the shared Schedule document. These tests read
// what a user sees at /demo/-/schedules — no fixtures, no stubbed status.
const DAILY_RULE = "demo-rule-daily-routines";

test.describe("Schedules Manager", () => {
    test("presents every Schedule as a management row with its operational status", async ({ page }) => {
        await page.goto("/demo/-/schedules");

        const table = page.getByTestId("schedules-manager-table");
        await expect(table).toBeVisible({ timeout: 30000 });

        for (
            const column of [
                "Enabled",
                "Name",
                "Target",
                "Cadence",
                "Last run",
                "Result",
                "Last successful run",
                "Next run",
            ]
        ) {
            await expect(table.locator("thead")).toContainText(column);
        }

        const row = table.locator(`[data-testid="schedule-row"][data-rule-id="${DAILY_RULE}"]`);
        await expect(row).toBeVisible({ timeout: 30000 });

        // Detail navigation stays available from the manager.
        await expect(row.getByTestId("schedule-rule-name")).toHaveAttribute(
            "href",
            `/demo/-/schedules/${DAILY_RULE}`,
        );
        // Existing management actions stay available too.
        await expect(row.getByTestId("schedule-rule-run-now")).toBeVisible();
        await expect(row.getByTestId("schedule-rule-edit")).toBeVisible();
        await expect(row.getByTestId("schedule-rule-delete")).toBeVisible();
    });

    test("shows the production scheduler's own next occurrence", async ({ page }) => {
        await page.goto("/demo/-/schedules");

        const nextRun = page
            .locator(`[data-testid="schedule-row"][data-rule-id="${DAILY_RULE}"]`)
            .getByTestId("schedule-rule-next-run");
        await expect(nextRun).toBeVisible({ timeout: 30000 });

        // Until the scheduler has published its cursor the manager says so
        // explicitly rather than computing an occurrence of its own; once it
        // has, the cell shows that authoritative instant.
        await expect(nextRun).toHaveAttribute("data-next-run-state", "scheduled", { timeout: 60000 });
        await expect(nextRun).toHaveText(/\d{4}-\d{2}-\d{2} \d{2}:\d{2}/);
    });

    test("turns a Schedule off through the shared document and back on", async ({ page }) => {
        await page.goto("/demo/-/schedules");

        const row = page.locator(`[data-testid="schedule-row"][data-rule-id="${DAILY_RULE}"]`);
        const toggle = row.getByTestId("schedule-rule-enabled");
        await expect(toggle).toBeVisible({ timeout: 30000 });
        await expect(toggle).toHaveAttribute("aria-checked", "true");

        await toggle.click();
        await expect(toggle).toHaveAttribute("aria-checked", "false");
        // A disabled Schedule presents no eligible occurrence.
        await expect(row.getByTestId("schedule-rule-next-run")).toHaveText("Disabled");

        // The state is the persisted one the production scheduler reads, so it
        // survives a reload rather than living in the page.
        await page.reload();
        const reloadedToggle = page
            .locator(`[data-testid="schedule-row"][data-rule-id="${DAILY_RULE}"]`)
            .getByTestId("schedule-rule-enabled");
        await expect(reloadedToggle).toBeVisible({ timeout: 30000 });
        await expect(reloadedToggle).toHaveAttribute("aria-checked", "false");

        await reloadedToggle.click();
        await expect(reloadedToggle).toHaveAttribute("aria-checked", "true");
    });
});
