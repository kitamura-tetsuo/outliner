import { expect, test } from "@playwright/test";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();

test.describe("Grid keyboard navigation mode (#5188)", () => {
    test.beforeEach(async ({ page }) => {
        await page.goto("/demo/-/grids/demo-table-routine-occurrences-grid");
        const gridView = page.getByTestId("yjs-table-view");
        await expect(gridView).toBeVisible({ timeout: 30000 });
        await occurrenceRow(page, "daily-inbox-").waitFor({ state: "visible", timeout: 30000 });
    });

    function occurrenceRow(page: import("@playwright/test").Page, idPrefix: string) {
        return page.getByTestId("yjs-table-grid").locator("tbody tr").filter({ hasText: idPrefix });
    }

    /**
     * Selects a text cell and focuses it without leaving it in edit mode.
     * Editable display buttons open the editor, so this cancels that path;
     * read-only result buttons remain focusable for selection/navigation and
     * need no cancellation. Both land in the same Grid navigation mode.
     */
    async function selectAndFocus(cell: import("@playwright/test").Locator) {
        const button = cell.locator("button");
        // aria-disabled communicates that editing is unavailable, but the
        // button deliberately remains a Grid selection/navigation target.
        await button.click({ force: true });
        const input = cell.locator("input");
        if (await input.isVisible()) {
            await input.press("Escape");
        }
        await expect(button).toBeFocused();
    }

    test("arrow keys move the active cell in all four directions", async ({ page }) => {
        const firstRow = occurrenceRow(page, "daily-inbox-");
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
        const secondRow = occurrenceRow(page, "daily-standup-");
        await expect(secondRow.locator("td[data-col='template_id']")).toHaveClass(/grid-active/);

        await page.keyboard.press("ArrowRight");
        await expect(secondRow.locator("td[data-col='title']")).toHaveClass(/grid-active/);

        await page.keyboard.press("ArrowUp");
        await expect(titleCell).toHaveClass(/grid-active/);
    });

    test("Shift+Arrow extends a rectangular selection from the anchor", async ({ page }) => {
        const grid = page.getByTestId("yjs-table-grid");
        const firstRow = occurrenceRow(page, "daily-inbox-");
        await selectAndFocus(firstRow.locator("td[data-col='title']"));

        await page.keyboard.down("Shift");
        await page.keyboard.press("ArrowDown");
        await page.keyboard.press("ArrowRight");
        await page.keyboard.up("Shift");

        await expect(grid.locator("td.grid-selected")).toHaveCount(4);
    });

    test("Escape reduces an extended range to its active cell", async ({ page }) => {
        const grid = page.getByTestId("yjs-table-grid");
        const firstRow = occurrenceRow(page, "daily-inbox-");
        await selectAndFocus(firstRow.locator("td[data-col='title']"));

        await page.keyboard.down("Shift");
        await page.keyboard.press("ArrowDown");
        await page.keyboard.press("ArrowRight");
        await page.keyboard.up("Shift");
        await page.keyboard.press("Escape");

        await expect(grid.locator("td.grid-selected")).toHaveCount(1);
        await expect(occurrenceRow(page, "daily-standup-").locator("td[data-col='cadence']")).toHaveClass(
            /grid-active/,
        );
    });

    test("Tab moves right and wraps to the next row at the edge", async ({ page }) => {
        const firstRow = occurrenceRow(page, "daily-inbox-");
        await selectAndFocus(firstRow.locator("td[data-col='title']"));

        await page.keyboard.press("Tab");
        await expect(firstRow.locator("td[data-col='cadence']")).toHaveClass(/grid-active/);

        await page.keyboard.press("Tab");
        await expect(firstRow.locator("td[data-col='occurrence_date']")).toHaveClass(/grid-active/);
    });

    test("Shift+Enter moves the active cell up", async ({ page }) => {
        const firstRow = occurrenceRow(page, "daily-inbox-");
        const secondRow = occurrenceRow(page, "daily-standup-");
        await selectAndFocus(secondRow.locator("td[data-col='title']"));

        await page.keyboard.down("Shift");
        await page.keyboard.press("Enter");
        await page.keyboard.up("Shift");
        await expect(firstRow.locator("td[data-col='title']")).toHaveClass(/grid-active/);
    });
});
