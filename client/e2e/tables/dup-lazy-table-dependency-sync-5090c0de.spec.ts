/** @feature DUP-5090c0de */
import "../utils/registerAfterEachSnapshot";
import { expect, test } from "../fixtures/grid-render-trace";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();

// Regression for #5112: open this route directly and never preload Routine
// Templates, because its unopened subdoc is the state under test. Since issue
// #5153, duplication routes through Object Manager's `Duplicate selected`
// rather than the Table page's own recursive scope chooser — `Select related
// → All connected` replaces the old "connected" scope option.
test("duplicates the connected recurring-task graph after lazy Table sync", async ({ page }) => {
    await page.goto("/demo/-/tables/demo-table-routine-occurrences");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Routine Occurrences", { timeout: 30000 });

    await page.getByRole("button", { name: "Duplicate Table" }).click();
    await expect(page).toHaveURL(/\/objects\?selected=/, { timeout: 15000 });
    const tableRow = page.locator('[data-testid^="object-row-"]').filter({ hasText: /^Routine Occurrences$/ }).filter({
        has: page.locator(".type-badge.table"),
    }).first();
    await expect(tableRow).toBeVisible({ timeout: 15000 });
    await expect(tableRow.locator('td.checkbox-col input[type="checkbox"]')).toBeChecked();

    await page.getByTestId("object-manager-select-related").click();
    await page.getByTestId("object-manager-select-related-connected").click();

    await page.getByTestId("object-manager-duplicate-selected").click();
    const dialog = page.getByTestId("object-manager-duplicate-dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText(/objects will be duplicated/);
    await dialog.getByTestId("object-manager-duplicate-apply").click();
    await expect(dialog).toBeHidden({ timeout: 30000 });

    await expect(
        page.locator('[data-testid^="object-row-"]').filter({ hasText: "Routine Occurrences copy" }).filter({
            has: page.locator(".type-badge.table"),
        }),
    ).toBeVisible({ timeout: 15000 });
    await expect(
        page.locator('[data-testid^="object-row-"]').filter({ hasText: "Routine Occurrences · daily copy" }),
    ).toBeVisible();
    await expect(
        page.locator('[data-testid^="object-row-"]').filter({ hasText: "Routine Occurrences · weekly copy" }),
    ).toBeVisible();
});
