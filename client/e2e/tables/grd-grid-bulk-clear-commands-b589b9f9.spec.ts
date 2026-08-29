/** @feature FTR-b589b9f9 */
import { expect, test } from "@playwright/test";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();

test.describe("Grid selection-aware Delete/Backspace clears cells (FTR-b589b9f9)", () => {
    test.beforeEach(async ({ page }) => {
        await page.goto("/demo/-/grids/demo-table-routine-occurrences-grid");
        const gridView = page.getByTestId("yjs-table-view");
        await expect(gridView).toBeVisible({ timeout: 30000 });
        const tbody = gridView.getByTestId("yjs-table-grid").locator("tbody");
        await tbody.locator("tr").first().waitFor({ state: "visible", timeout: 30000 });
    });

    test("Delete clears a cell/range selection's writable contents instead of removing the records", async ({ page }) => {
        const grid = page.getByTestId("yjs-table-grid");
        const firstRow = grid.locator("tbody tr").nth(0);
        const secondRow = grid.locator("tbody tr").nth(1);
        const rowCountBefore = await grid.locator("tbody tr").count();

        await firstRow.locator("td[data-col='title']").locator("button").click();
        await page.keyboard.press("Escape");
        await page.keyboard.down("Shift");
        await page.keyboard.press("ArrowDown");
        await page.keyboard.up("Shift");
        await expect(grid.locator("td.grid-selected")).toHaveCount(2);

        await page.keyboard.press("Delete");

        await expect(firstRow.locator("td[data-col='title']").locator("button")).toHaveText("", { timeout: 30000 });
        await expect(secondRow.locator("td[data-col='title']").locator("button")).toHaveText("", { timeout: 30000 });
        // No record was removed -- only its content was cleared.
        await expect(grid.locator("tbody tr")).toHaveCount(rowCountBefore);
    });

    test("Backspace clears an entire selected column, leaving other columns untouched", async ({ page }) => {
        const grid = page.getByTestId("yjs-table-grid");
        const firstRow = grid.locator("tbody tr").first();
        const originalTitle = (await firstRow.locator("td[data-col='title']").locator("button").textContent())
            ?.trim() ?? "";

        const occurrenceDateHeader = grid.locator("th[role='columnheader']", { hasText: "occurrence_date" });
        await occurrenceDateHeader.click();
        await expect(occurrenceDateHeader).toHaveClass(/header-selected/);

        await page.keyboard.press("Backspace");

        const dateInputs = grid.locator("tbody tr td[data-col='occurrence_date'] input");
        for (const input of await dateInputs.all()) {
            await expect(input).toHaveValue("", { timeout: 30000 });
        }
        // A different column was never part of the selection.
        await expect(firstRow.locator("td[data-col='title']").locator("button")).toHaveText(originalTitle);
    });

    test("Delete on a select-all selection clears cells but never removes every record", async ({ page }) => {
        const grid = page.getByTestId("yjs-table-grid");
        const rowCountBefore = await grid.locator("tbody tr").count();

        const corner = grid.locator("th[role='columnheader']", { hasText: "Select current query result" });
        await corner.click();
        await expect(corner).toHaveAttribute("aria-selected", "true");

        await page.keyboard.press("Delete");

        await expect(grid.locator("tbody tr")).toHaveCount(rowCountBefore, { timeout: 30000 });
        const titleButtons = grid.locator("tbody tr td[data-col='title'] button");
        for (const button of await titleButtons.all()) {
            await expect(button).toHaveText("", { timeout: 30000 });
        }
    });
});
