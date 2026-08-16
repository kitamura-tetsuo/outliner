/** @feature TBL-3950a1b2 */
import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

test.describe("Schedule Rule Run Now", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        await TestHelpers.seedProjectAndNavigate(page, testInfo);
        await TestHelpers.waitForOutlinerItems(page, 1);
    });

    test("should allow running a schedule rule immediately", async ({ page }) => {
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

        const scheduleToggle = tableBlock.locator("[data-testid='yjs-table-toggle-schedule']");
        await scheduleToggle.click();
        const schedulePanel = tableBlock.locator("[data-testid='yjs-table-schedule-panel']");
        await expect(schedulePanel).toBeVisible();

        const newRuleBtn = schedulePanel.locator("[data-testid='yjs-table-schedule-create']");
        await newRuleBtn.click();

        const sqlInput = schedulePanel.locator("textarea").first();
        await sqlInput.fill("INSERT INTO {{table}} (title, id) VALUES ('run-now test', gen_random_uuid());");
        await page.waitForTimeout(500);

        const saveBtn = schedulePanel.locator("button:has-text('Save')");
        await saveBtn.click();

        await expect(schedulePanel.locator("button:has-text('Save')")).toBeHidden({ timeout: 10000 });

        const ruleItem = schedulePanel.locator(".schedule-rule-list li").first();
        await ruleItem.waitFor({ state: "visible", timeout: 30000 });

        const runNowBtn = ruleItem.locator("[data-testid='schedule-rule-run-now']");
        await runNowBtn.waitFor({ state: "visible" });

        await runNowBtn.click();

        // Wait for server execution to sync
        await expect(ruleItem.locator("text=(OK)")).toBeVisible({ timeout: 15000 });

        // Ensure that run was ok
        const okText = ruleItem.locator("text=(OK)");
        await expect(okText).toBeVisible();

        const gridToggle = tableBlock.locator("[data-testid='yjs-table-toggle-grid']");
        await gridToggle.click();

        const insertedRow = tableBlock.locator("text='run-now test'");
        await expect(insertedRow).toBeVisible();
    });

    test("should display inline error on invalid SQL", async ({ page }) => {
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

        const scheduleToggle = tableBlock.locator("[data-testid='yjs-table-toggle-schedule']");
        await scheduleToggle.click();
        const schedulePanel = tableBlock.locator("[data-testid='yjs-table-schedule-panel']");
        await expect(schedulePanel).toBeVisible();

        const newRuleBtn = schedulePanel.locator("[data-testid='yjs-table-schedule-create']");
        await newRuleBtn.click();

        const sqlInput = schedulePanel.locator("textarea").first();
        await sqlInput.fill("INVALID SQL SYNTAX");
        await page.waitForTimeout(500);

        const saveBtn = schedulePanel.locator("button:has-text('Save')");
        await saveBtn.click();

        await expect(schedulePanel.locator("button:has-text('Save')")).toBeHidden({ timeout: 10000 });

        const ruleItem = schedulePanel.locator(".schedule-rule-list li").first();
        await ruleItem.waitFor({ state: "visible", timeout: 30000 });

        const runNowBtn = ruleItem.locator("[data-testid='schedule-rule-run-now']");
        await runNowBtn.waitFor({ state: "visible" });
        await runNowBtn.click();

        const errorBox = schedulePanel.locator(".bg-red-50.border-red-100");
        await expect(errorBox).toBeVisible({ timeout: 15000 });
        await expect(errorBox).toContainText("syntax error at or near");
    });
});
