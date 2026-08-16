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

        await page.route("**/api/schedules/run-now", async route => {
            setTimeout(async () => {
                const json = { ok: true };
                await route.fulfill({ json });
            }, 500);
        });

        await runNowBtn.click();

        // Ensure "Running..." appears
        await expect(runNowBtn).toHaveText("Running…", { timeout: 5000 });

        // Wait for server execution to sync
        await expect(ruleItem.locator("text=(OK)")).toBeVisible({ timeout: 15000 });
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
        // Insert VALID SQL so that the UI can save properly
        await sqlInput.fill("INSERT INTO {{table}} (title, id) VALUES ('run-now test', gen_random_uuid());");
        await page.waitForTimeout(500);

        const saveBtn = schedulePanel.locator("button:has-text('Save')");
        await saveBtn.click();

        await expect(schedulePanel.locator("button:has-text('Save')")).toBeHidden({ timeout: 10000 });

        const ruleItem = schedulePanel.locator(".schedule-rule-list li").first();
        await ruleItem.waitFor({ state: "visible", timeout: 30000 });

        // Mock the run-now endpoint to return an error specifically for this test
        await page.route("**/api/schedules/run-now", async route => {
            const json = { ok: false, error: "syntax error at or near INVALID SQL" };
            await route.fulfill({ json });
        });

        const runNowBtn = ruleItem.locator("[data-testid='schedule-rule-run-now']");
        await runNowBtn.waitFor({ state: "visible" });
        await runNowBtn.click();

        const errorBox = schedulePanel.locator(".bg-red-50.border-red-100");
        await expect(errorBox).toBeVisible({ timeout: 15000 });
        await expect(errorBox).toContainText("syntax error at or near");
    });
});
