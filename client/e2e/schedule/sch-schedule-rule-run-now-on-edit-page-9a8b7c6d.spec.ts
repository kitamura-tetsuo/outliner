/** @feature TBL-3950a1b2 */
import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

test.describe("Schedule Rule Run Now on Edit Page", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        await TestHelpers.seedProjectAndNavigate(page, testInfo, ["Test Table Item"]);
        await TestHelpers.waitForOutlinerItems(page, 1);
    });

    test("should allow running a schedule rule immediately from the edit page", async ({ page }) => {
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

        // Open the sidebar
        const showBtn = page.locator('button[aria-label="Show sidebar"]');
        if (await showBtn.isVisible().catch(() => false)) {
            await showBtn.click();
        }
        const sidebar = page.locator('aside.sidebar[aria-label="Main Sidebar"]');
        await expect(sidebar).toBeVisible({ timeout: 10000 });

        // Click + to add new scheduled SQL rule
        await sidebar.locator('button[aria-label="Add new scheduled SQL"]').click();

        // Wait for navigation to the edit page
        await expect(page).toHaveURL(/\/schedules\/[^/]+\/[^/]+$/, { timeout: 15000 });
        await expect(page.getByRole("heading", { name: "Edit Scheduled SQL" })).toBeVisible({ timeout: 15000 });

        // Assert Run now precedes Delete in DOM
        const runNowBtn = page.locator("[data-testid='run-now-schedule']");
        const deleteBtn = page.locator("[data-testid='delete-schedule']");
        await expect(runNowBtn).toBeVisible();
        await expect(deleteBtn).toBeVisible();
        // Check order in the parent container
        const buttons = page.locator(".flex.space-x-2 button");
        await expect(buttons.nth(0)).toHaveAttribute("data-testid", "run-now-schedule");
        await expect(buttons.nth(1)).toHaveAttribute("data-testid", "delete-schedule");

        // Fill SQL
        const sqlInput = page.locator("textarea").first();
        await expect(sqlInput).toBeVisible();
        await sqlInput.fill("INSERT INTO {{table}} (title, id) VALUES ('run-now test', gen_random_uuid());");
        await page.waitForTimeout(500);

        // Save
        const saveBtn = page.locator("button:has-text('Save')");
        await saveBtn.click();

        // Wait for navigation back to project
        await expect(page).not.toHaveURL(/\/schedules\/[^/]+\/[^/]+$/, { timeout: 15000 });

        // Re-open sidebar and click the rule
        if (await showBtn.isVisible().catch(() => false)) {
            await showBtn.click();
        }
        await expect(sidebar).toBeVisible({ timeout: 10000 });
        const ruleLink = sidebar.locator("#sidebar-schedules-list li a.schedule-link").first();
        await expect(ruleLink).toBeVisible({ timeout: 10000 });
        await ruleLink.click();

        // Wait for navigation to the edit page
        await expect(page).toHaveURL(/\/schedules\/[^/]+\/[^/]+$/, { timeout: 15000 });
        await expect(runNowBtn).toBeVisible({ timeout: 15000 });

        // Mock the run-now endpoint to prevent flakey db execution from holding up UI tests, just like the core sch-schedule-rule-run-now-3a4b5c6d.spec.ts does. We assert the reachable states.
        await page.route("**/api/schedules/run-now", async route => {
            setTimeout(async () => {
                const json = { ok: true };
                await route.fulfill({ json });
            }, 500);
        });

        await runNowBtn.click();

        // Assert Running... state
        await expect(runNowBtn).toHaveText("Running…", { timeout: 5000 });
        await expect(runNowBtn).toBeDisabled();

        // Assert it restores
        await expect(runNowBtn).toHaveText("Run now", { timeout: 15000 });
        await expect(runNowBtn).toBeEnabled();
        await expect(page.locator(".bg-red-50.border-red-100")).toHaveCount(0);
    });

    test("should display error on invalid SQL", async ({ page }) => {
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

        // Open the sidebar
        const showBtn = page.locator('button[aria-label="Show sidebar"]');
        if (await showBtn.isVisible().catch(() => false)) {
            await showBtn.click();
        }
        const sidebar = page.locator('aside.sidebar[aria-label="Main Sidebar"]');
        await expect(sidebar).toBeVisible({ timeout: 10000 });

        // Click + to add new scheduled SQL rule
        await sidebar.locator('button[aria-label="Add new scheduled SQL"]').click();

        // Wait for navigation to the edit page
        await expect(page).toHaveURL(/\/schedules\/[^/]+\/[^/]+$/, { timeout: 15000 });

        // Fill SQL with INVALID syntax
        const sqlInput = page.locator("textarea").first();
        await expect(sqlInput).toBeVisible();
        await sqlInput.fill("INVALID SQL SYNTAX");
        await page.waitForTimeout(500);

        // Save
        const saveBtn = page.locator("button:has-text('Save')");
        await saveBtn.click();

        // Re-open sidebar and click the rule
        if (await showBtn.isVisible().catch(() => false)) {
            await showBtn.click();
        }
        const ruleLink = sidebar.locator("#sidebar-schedules-list li a.schedule-link").first();
        await expect(ruleLink).toBeVisible({ timeout: 15000 });
        await ruleLink.click();

        // Wait for navigation to the edit page
        await expect(page).toHaveURL(/\/schedules\/[^/]+\/[^/]+$/, { timeout: 15000 });
        const runNowBtn = page.locator("[data-testid='run-now-schedule']");
        await expect(runNowBtn).toBeVisible({ timeout: 15000 });

        // Mock the run-now endpoint to return an error specifically for this test
        await page.route("**/api/schedules/run-now", async route => {
            const json = { ok: false, error: "syntax error at or near INVALID SQL" };
            await route.fulfill({ json });
        });

        await runNowBtn.click();

        const errorBox = page.locator(".bg-red-50", { hasText: "syntax error" });
        await expect(errorBox).toBeVisible({ timeout: 15000 });

        // Assert we stay on the page
        await expect(page).toHaveURL(/\/schedules\/[^/]+\/[^/]+$/);
    });
});
