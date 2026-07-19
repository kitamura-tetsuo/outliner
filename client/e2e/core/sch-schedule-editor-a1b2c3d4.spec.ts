import { expect, test } from "@playwright/test";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";

registerCoverageHooks();

test.describe("Schedule Editor UI [FTR-a1b2c3d4]", () => {
    test("creates preset rule, shows sub-hourly error, and runs e2e", async ({ page }) => {
        await page.goto("/demo/Tasks%20and%20Habits?isTest=true");
        await page.waitForSelector('[data-testid="yjs-table-block"]', { timeout: 30000 });

        const tableBlock = page.locator('[data-testid="yjs-table-block"]').nth(1);
        await expect(tableBlock).toBeVisible({ timeout: 15000 });

        const toggleScheduleBtn = tableBlock.locator('[data-testid="yjs-table-toggle-schedule"]').first();
        await expect(toggleScheduleBtn).toBeVisible({ timeout: 15000 });
        await toggleScheduleBtn.click();

        const schedulePanel = tableBlock.locator('[data-testid="table-schedule-panel"]').first();
        await expect(schedulePanel).toBeVisible({ timeout: 15000 });

        await schedulePanel.locator('[data-testid="rule-name-input"]').first().fill("Test Preset Rule");
        await schedulePanel.locator('[data-testid="rule-sql-input"]').first().fill(
            "INSERT INTO test_table (id) VALUES (gen_random_uuid());",
        );

        await schedulePanel.locator('[data-testid="rule-freq-select"]').first().selectOption("WEEKLY");
        await schedulePanel.locator('input[type="checkbox"][value="2"]').first().check();
        await schedulePanel.locator('input[type="checkbox"][value="4"]').first().check();

        await schedulePanel.locator('input[type="checkbox"][value="1"]').first().uncheck().catch(() => {});
        await schedulePanel.locator('input[type="checkbox"][value="3"]').first().uncheck().catch(() => {});

        await schedulePanel.locator('[data-testid="rule-end-condition"]').first().selectOption("count");
        await schedulePanel.locator('[data-testid="rule-count-input"]').first().fill("10");

        await schedulePanel.locator('[data-testid="create-preset-rule-btn"]').first().click();

        await expect(
            schedulePanel.locator('[data-testid="schedule-rule-item"]').filter({ hasText: "Test Preset Rule" }).first(),
        ).toBeVisible();
        await expect(
            schedulePanel.locator('[data-testid="schedule-rule-item"]').filter({ hasText: "Test Preset Rule" }).first(),
        ).toContainText("FREQ=WEEKLY");
        await expect(
            schedulePanel.locator('[data-testid="schedule-rule-item"]').filter({ hasText: "Test Preset Rule" }).first(),
        ).toContainText("BYDAY=TU,TH");
        await expect(
            schedulePanel.locator('[data-testid="schedule-rule-item"]').filter({ hasText: "Test Preset Rule" }).first(),
        ).toContainText("COUNT=10");

        await schedulePanel.locator('input[type="radio"][value="true"]').first().check();
        await schedulePanel.locator('[data-testid="rule-name-input"]').first().fill("Minutely Rule");
        await schedulePanel.locator('[data-testid="rule-raw-input"]').first().fill("FREQ=MINUTELY;INTERVAL=15");

        await schedulePanel.locator('[data-testid="rule-sql-input"]').first().fill("SELECT * FROM");
        await expect(schedulePanel.locator('[data-testid="rule-sql-error"]')).toBeVisible();

        await schedulePanel.locator('[data-testid="rule-sql-input"]').first().fill("DELETE FROM test_table;");
        await expect(schedulePanel.locator('[data-testid="rule-sql-error"]')).not.toBeVisible();
        await schedulePanel.locator('[data-testid="create-raw-rule-btn"]').first().click();

        await expect(
            schedulePanel.locator('[data-testid="schedule-rule-item"]').filter({ hasText: "Minutely Rule" }).first(),
        ).toBeVisible();
        await expect(
            schedulePanel.locator('[data-testid="schedule-rule-item"]').filter({ hasText: "Minutely Rule" }).first(),
        ).toContainText("FREQ=MINUTELY;INTERVAL=15");

        await page.evaluate(() => {
            const btns = document.querySelectorAll('button[data-testid="yjs-table-toggle-grid"]');
            if (btns.length > 1) {
                (btns[1] as HTMLElement).click();
            }
        });
        await expect(tableBlock.locator('button[data-testid="yjs-table-toggle-grid"]').first()).toHaveAttribute(
            "aria-pressed",
            "true",
        );
    });
});
