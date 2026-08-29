import { expect, test } from "@playwright/test";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();

test.describe("Grid keyboard navigation mode (#5188)", () => {
    test.beforeEach(async ({ page }) => {
        await page.goto("/demo/-/grids/demo-table-routine-occurrences-grid");
        const gridView = page.getByTestId("yjs-table-view");
        await expect(gridView).toBeVisible({ timeout: 30000 });
        const tbody = gridView.getByTestId("yjs-table-grid").locator("tbody");
        await tbody.locator("tr").first().waitFor({ state: "visible", timeout: 30000 });
    });

    /**
     * Selects a text cell and focuses it without leaving it in edit mode: a
     * plain click on the display button opens the editor (see TextCell), so
     * this clicks then immediately cancels with Escape, landing exactly on
     * Grid's navigation-mode contract (selected, focused, not editing).
     */
    async function selectAndFocus(cell: import("@playwright/test").Locator) {
        await cell.locator("button").click();
        await expect(cell.locator("input")).toBeVisible();
        await cell.locator("input").press("Escape");
        await expect(cell.locator("button")).toBeFocused();
    }

    test("arrow keys move the active cell in all four directions", async ({ page }) => {
        const grid = page.getByTestId("yjs-table-grid");
        const firstRow = grid.locator("tbody tr").first();
        const titleCell = firstRow.locator("td[data-col='title']");
        await selectAndFocus(titleCell);
        await expect(titleCell).toHaveClass(/grid-active/);

        // Stay within the two adjacent text columns (template_id, title):
        // once a select/date/checkbox cell is focused it owns arrow keys
        // natively (see the dedicated exception test below), so a plain
        // arrow-key sequence must not cross into one.
        await page.keyboard.press("ArrowLeft");
        await expect(firstRow.locator("td[data-col='template_id']")).toHaveClass(/grid-active/);
        await expect(titleCell).not.toHaveClass(/grid-active/);

        await page.keyboard.press("ArrowDown");
        const secondRow = grid.locator("tbody tr").nth(1);
        await expect(secondRow.locator("td[data-col='template_id']")).toHaveClass(/grid-active/);

        await page.keyboard.press("ArrowRight");
        await expect(secondRow.locator("td[data-col='title']")).toHaveClass(/grid-active/);

        await page.keyboard.press("ArrowUp");
        await expect(titleCell).toHaveClass(/grid-active/);
    });

    test("Shift+Arrow extends a rectangular selection from the anchor", async ({ page }) => {
        const grid = page.getByTestId("yjs-table-grid");
        const firstRow = grid.locator("tbody tr").first();
        await selectAndFocus(firstRow.locator("td[data-col='title']"));

        await page.keyboard.down("Shift");
        await page.keyboard.press("ArrowDown");
        await page.keyboard.press("ArrowRight");
        await page.keyboard.up("Shift");

        await expect(grid.locator("td.grid-selected")).toHaveCount(4);
    });

    test("Tab moves right and wraps to the next row at the edge", async ({ page }) => {
        const grid = page.getByTestId("yjs-table-grid");
        const firstRow = grid.locator("tbody tr").first();
        await selectAndFocus(firstRow.locator("td[data-col='title']"));

        await page.keyboard.press("Tab");
        await expect(firstRow.locator("td[data-col='cadence']")).toHaveClass(/grid-active/);

        await page.keyboard.press("Tab");
        await expect(firstRow.locator("td[data-col='occurrence_date']")).toHaveClass(/grid-active/);
    });

    test("Shift+Enter moves the active cell up", async ({ page }) => {
        const grid = page.getByTestId("yjs-table-grid");
        const firstRow = grid.locator("tbody tr").first();
        const secondRow = grid.locator("tbody tr").nth(1);
        await selectAndFocus(secondRow.locator("td[data-col='title']"));

        await page.keyboard.down("Shift");
        await page.keyboard.press("Enter");
        await page.keyboard.up("Shift");
        await expect(firstRow.locator("td[data-col='title']")).toHaveClass(/grid-active/);
    });
});
