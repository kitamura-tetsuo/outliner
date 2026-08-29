/** @feature FTR-b589b9f9 */
import { expect, test } from "@playwright/test";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();

test.describe("Grid selection-aware Delete removes rows; bulk checkbox commit (FTR-b589b9f9)", () => {
    test.beforeEach(async ({ page }) => {
        await page.goto("/demo/-/grids/demo-table-routine-occurrences-grid");
        const gridView = page.getByTestId("yjs-table-view");
        await expect(gridView).toBeVisible({ timeout: 30000 });
        const tbody = gridView.getByTestId("yjs-table-grid").locator("tbody");
        await tbody.locator("tr").first().waitFor({ state: "visible", timeout: 30000 });
    });

    test("Delete removes every selected row when a rows-kind selection is active", async ({ page }) => {
        const grid = page.getByTestId("yjs-table-grid");
        const rowCountBefore = await grid.locator("tbody tr").count();

        await grid.getByRole("rowheader", { name: "Select row 1" }).click();
        await grid.getByRole("rowheader", { name: "Select row 2" }).click({ modifiers: ["Control"] });
        await expect(grid.locator("th.row-header.header-selected")).toHaveCount(2);

        await page.keyboard.press("Delete");

        await expect(grid.locator("tbody tr")).toHaveCount(rowCountBefore - 2, { timeout: 30000 });
    });

    test("a Shift-click that extends a checkbox selection applies the new value to the whole selection", async ({ page }) => {
        const grid = page.getByTestId("yjs-table-grid");
        const rows = grid.locator("tbody tr");
        const doneCheckbox = (rowIndex: number) =>
            rows.nth(rowIndex).locator("td[data-col='done'] input[type=checkbox]");

        await expect(doneCheckbox(0)).not.toBeChecked();
        await expect(doneCheckbox(1)).not.toBeChecked();
        await expect(doneCheckbox(2)).not.toBeChecked();

        // A plain click both selects the cell and toggles it (native checkbox
        // behavior); a Shift-click extends the selection to include the newly
        // clicked cell *before* its own toggle commits, so that commit applies
        // to every writable cell the selection now covers.
        await doneCheckbox(0).click();
        await doneCheckbox(1).click({ modifiers: ["Shift"] });

        await expect(doneCheckbox(0)).toBeChecked({ timeout: 30000 });
        await expect(doneCheckbox(1)).toBeChecked({ timeout: 30000 });
        // The selection never covered the third row -- it is untouched.
        await expect(doneCheckbox(2)).not.toBeChecked();
    });
});
