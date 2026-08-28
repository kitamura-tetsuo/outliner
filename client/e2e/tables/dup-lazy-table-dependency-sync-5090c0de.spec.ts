/** @feature DUP-5090c0de */
import "../utils/registerAfterEachSnapshot";
import { expect, test } from "@playwright/test";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();

// Regression for #5112: open this route directly and never preload Routine
// Templates, because its unopened subdoc is the state under test.
test("duplicates the connected recurring-task graph after lazy Table sync", async ({ page }) => {
    await page.goto("/demo/-/tables/demo-table-routine-occurrences");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Routine Occurrences", { timeout: 30000 });

    await page.getByRole("button", { name: "Duplicate Table" }).click();
    const dialog = page.getByTestId("object-duplication-dialog");
    await dialog.locator("select").selectOption("connected");
    await expect(dialog).toContainText(/objects will be duplicated/);
    await dialog.getByRole("button", { name: "Duplicate" }).click();

    await expect(page).toHaveURL(/\/demo\/-\/tables\/(?!demo-table-routine-occurrences$)[^/]+$/, { timeout: 30000 });
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Routine Occurrences copy", {
        timeout: 30000,
    });
    const schedules = page.getByTestId("table-schedule-references");
    await expect(schedules).toContainText("Routine Occurrences · daily copy", { timeout: 30000 });
    await expect(schedules).toContainText("Routine Occurrences · weekly copy");
});
