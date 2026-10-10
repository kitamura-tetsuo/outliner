import { expect, test } from "@playwright/test";
import {
    keyboardTaskRow as taskRow,
    prepareKeyboardGrid,
    selectAndFocusCell as selectAndFocus,
} from "../utils/gridKeyboardFixture";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();

test.describe("Grid keyboard navigation mode (#5188)", () => {
    let firstRowId: string;
    let secondRowId: string;

    test.beforeEach(async ({ page }, testInfo) => {
        [firstRowId, secondRowId] = await prepareKeyboardGrid(page, testInfo);
    });

    test("arrow keys move the active cell in all four directions", async ({ page }) => {
        const firstRow = taskRow(page, firstRowId);
        const titleCell = firstRow.locator("td[data-col='title']");
        await selectAndFocus(titleCell);
        await expect(titleCell).toHaveClass(/grid-active/);

        // Stay within the two adjacent text columns (id, title):
        // once a select/date/checkbox cell is focused it owns arrow keys
        // natively (see the dedicated exception test below), so a plain
        // arrow-key sequence must not cross into one.
        await page.keyboard.press("ArrowLeft");
        await expect(firstRow.locator("td[data-col='id']")).toHaveClass(/grid-active/);
        await expect(titleCell).not.toHaveClass(/grid-active/);

        await page.keyboard.press("ArrowDown");
        const secondRow = taskRow(page, secondRowId);
        await expect(secondRow.locator("td[data-col='id']")).toHaveClass(/grid-active/);

        await page.keyboard.press("ArrowRight");
        await expect(secondRow.locator("td[data-col='title']")).toHaveClass(/grid-active/);

        await page.keyboard.press("ArrowUp");
        await expect(titleCell).toHaveClass(/grid-active/);
    });

    test("Shift+Arrow extends a rectangular selection from the anchor", async ({ page }) => {
        const grid = page.getByTestId("yjs-table-grid");
        const firstRow = taskRow(page, firstRowId);
        await selectAndFocus(firstRow.locator("td[data-col='title']"));

        await page.keyboard.down("Shift");
        await page.keyboard.press("ArrowDown");
        await page.keyboard.press("ArrowRight");
        await page.keyboard.up("Shift");

        await expect(grid.locator("td.grid-selected")).toHaveCount(4);
    });

    test("Escape reduces an extended range to its active cell", async ({ page }) => {
        const grid = page.getByTestId("yjs-table-grid");
        const firstRow = taskRow(page, firstRowId);
        await selectAndFocus(firstRow.locator("td[data-col='title']"));

        await page.keyboard.down("Shift");
        await page.keyboard.press("ArrowDown");
        await page.keyboard.press("ArrowRight");
        await page.keyboard.up("Shift");
        await page.keyboard.press("Escape");

        await expect(grid.locator("td.grid-selected")).toHaveCount(1);
        await expect(taskRow(page, secondRowId).locator("td[data-col='status']")).toHaveClass(
            /grid-active/,
        );
    });

    test("Tab moves right and wraps to the next row at the edge", async ({ page }) => {
        const firstRow = taskRow(page, firstRowId);
        await selectAndFocus(firstRow.locator("td[data-col='title']"));

        await page.keyboard.press("Tab");
        await expect(firstRow.locator("td[data-col='status']")).toHaveClass(/grid-active/);

        await page.keyboard.press("Tab");
        await expect(firstRow.locator("td[data-col='priority']")).toHaveClass(/grid-active/);
    });

    test("Shift+Enter moves the active cell up", async ({ page }) => {
        const firstRow = taskRow(page, firstRowId);
        const secondRow = taskRow(page, secondRowId);
        await selectAndFocus(secondRow.locator("td[data-col='title']"));

        await page.keyboard.press("Shift+Enter");
        await expect(firstRow.locator("td[data-col='title']")).toHaveClass(/grid-active/);
        await expect(firstRow.locator("td[data-col='title'] button")).toBeFocused();
        await expect(secondRow.locator("td[data-col='title']")).not.toHaveClass(/grid-active/);
        await expect(page.getByTestId("yjs-table-grid").locator("input.cell-input")).toHaveCount(0);
    });
});
