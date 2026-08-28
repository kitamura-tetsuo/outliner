/** @feature DUP-1f5f6ffd */
import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

// Schedule duplication (issue #5102) extends the Grid/Table dependency-aware
// duplication feature (#5090/#5092) so a Schedule can be duplicated directly
// from its own edit page, through the same ObjectDuplicationDialog.
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
        await expect(page).not.toHaveURL(/\/-\/schedules\/[^/]+$/, { timeout: 15000 });

        // Re-open the rule from the schedules list.
        await page.goto(`/${projectSegment}/-/schedules`);
        await page.locator("button:has-text('Edit')").first().click();
        await expect(page).toHaveURL(new RegExp(`/${projectSegment}/-/schedules/[^/]+$`), { timeout: 15000 });
        const sourceUrl = page.url();

        // Duplicate it into the same project via the Duplicate Schedule dialog.
        await page.getByTestId("duplicate-schedule").click();
        const dialog = page.getByTestId("object-duplication-dialog");
        await expect(dialog).toBeVisible();
        await expect(dialog.locator("h2")).toHaveText("Duplicate Schedule");
        await dialog.locator("button:has-text('Duplicate')").click();

        // The dialog navigates to the copy's own Schedule route, distinct from the source.
        await expect(page).toHaveURL(new RegExp(`/${projectSegment}/-/schedules/[^/]+$`), { timeout: 15000 });
        expect(page.url()).not.toBe(sourceUrl);
        await expect(page.getByTestId("target-table-select")).toBeVisible({ timeout: 15000 });

        // The copy carries the collision-safe "copy" name and its own target table selection.
        await expect(page.locator("#name-input")).toHaveValue("Daily import copy");
        await expect(page.getByTestId("target-table-select")).not.toHaveValue("");

        // The original rule is untouched and still lists alongside its copy.
        await page.goto(`/${projectSegment}/-/schedules`);
        const list = page.getByTestId("project-schedule-list");
        await expect(list).toBeVisible({ timeout: 30000 });
        await expect(list.locator(".schedule-rule-list li")).toHaveCount(2);
    });
});
