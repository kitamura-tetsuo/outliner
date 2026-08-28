/** @feature TBL-3950a1b2 */
import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

// Schedules are project-level entities (issue #5012): they are created, listed
// and deleted from /:project/-/schedules, not from a panel inside a table view.
test.describe("Project Schedule Rule UI", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        await TestHelpers.seedProjectAndNavigate(page, testInfo);
    });

    test("creates, edits and deletes a schedule rule from the project schedules page", async ({ page }) => {
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

        // The table view must not offer any Schedule surface of its own.
        await expect(tableBlock.locator("[data-testid='yjs-table-toggle-schedule']")).toHaveCount(0);

        const projectSegment = new URL(page.url()).pathname.split("/")[1];
        await page.goto(`/${projectSegment}/-/schedules`);

        const list = page.getByTestId("project-schedule-list");
        await expect(list).toBeVisible({ timeout: 30000 });
        await expect(list.locator("text=No schedule rules defined")).toBeVisible();

        // Creating goes straight to the rule's own page.
        await page.getByTestId("project-schedule-create").click();
        await expect(page).toHaveURL(new RegExp(`/${projectSegment}/-/schedules/[^/]+$`), { timeout: 15000 });
        await expect(page.locator("text=SQL Statement")).toBeVisible({ timeout: 15000 });

        // The target table is a reference the rule picks, not an owner.
        await expect(page.getByTestId("target-table-select")).toBeVisible();

        await page.goto(`/${projectSegment}/-/schedules`);
        await expect(list.locator("text=every day")).toBeVisible({ timeout: 30000 });

        // Edit navigates to the rule page; the list is only a list.
        await list.locator("button:has-text('Edit')").first().click();
        await expect(page).toHaveURL(new RegExp(`/${projectSegment}/-/schedules/[^/]+$`), { timeout: 15000 });

        await page.goto(`/${projectSegment}/-/schedules`);
        await expect(list.locator("text=every day")).toBeVisible({ timeout: 30000 });

        page.on("dialog", dialog => dialog.accept());
        await list.locator("button:has-text('Delete')").first().click();
        await expect(list.locator("text=No schedule rules defined")).toBeVisible({ timeout: 15000 });
    });
});
