/** @feature DUP-1f5f6ffd */
import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

// Schedule duplication (issue #5102) extends the Grid/Table dependency-aware
// duplication feature (#5090/#5092). Since issue #5153, the Schedule edit
// page's "Duplicate Schedule" button routes into Object Manager with the
// Schedule preselected instead of opening its own dialog — Object Manager's
// `Duplicate selected` is now the single duplication entry point.
test.describe("Schedule duplication", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        await TestHelpers.seedProjectAndNavigate(page, testInfo);
    });

    test("duplicates a Schedule into the same project via the edit page", async ({ page }) => {
        // A schedule needs a table to write into, so make one first.
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

        // Create a Schedule rule targeting that table, from the project schedules page.
        await page.goto(`/${projectSegment}/-/schedules`);
        await page.getByTestId("project-schedule-create").click();
        await expect(page).toHaveURL(new RegExp(`/${projectSegment}/-/schedules/[^/]+$`), { timeout: 15000 });

        await page.locator("#name-input").fill("Daily import");
        await page.locator("button:has-text('Save')").click();
        await expect(page).toHaveURL(new RegExp(`/${projectSegment}/-/schedules/[^/]+$`), { timeout: 15000 });

        // Duplicate opens Object Manager with the Schedule preselected (#5153 §10).
        await page.getByTestId("duplicate-schedule").click();
        await expect(page).toHaveURL(/\/objects\?selected=/, { timeout: 15000 });
        const scheduleRow = page.locator('[data-testid^="object-row-"]').filter({ hasText: "Daily import" }).filter({
            has: page.locator(".type-badge.schedule"),
        });
        await expect(scheduleRow).toBeVisible({ timeout: 15000 });
        await expect(scheduleRow.locator('td.checkbox-col input[type="checkbox"]')).toBeChecked();

        // Duplicate selected into the same project via Object Manager's dialog.
        await page.getByTestId("object-manager-duplicate-selected").click();
        const dialog = page.getByTestId("object-manager-duplicate-dialog");
        await expect(dialog).toBeVisible();
        await dialog.getByTestId("object-manager-duplicate-apply").click();
        await expect(dialog).toBeHidden({ timeout: 15000 });

        // The copy carries the collision-safe "copy" name and appears alongside the original.
        const copyRow = page.locator('[data-testid^="object-row-"]').filter({ hasText: "Daily import copy" })
            .filter({ has: page.locator(".type-badge.schedule") });
        await expect(copyRow).toBeVisible({ timeout: 15000 });

        // The original rule is untouched and still lists alongside its copy:
        // one Schedules Manager row each.
        await page.goto(`/${projectSegment}/-/schedules`);
        const list = page.getByTestId("project-schedule-list");
        await expect(list).toBeVisible({ timeout: 30000 });
        await expect(list.locator("[data-testid='schedule-row']")).toHaveCount(2);
    });
});
