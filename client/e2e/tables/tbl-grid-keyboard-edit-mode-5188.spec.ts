import { expect, test } from "@playwright/test";
import { keyboardTaskRow as taskRow, prepareKeyboardGrid, selectAndFocusCell } from "../utils/gridKeyboardFixture";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();

test.describe("Grid keyboard edit mode (#5188)", () => {
    let firstRowId: string;
    let secondRowId: string;

    test.beforeEach(async ({ page }, testInfo) => {
        [firstRowId, secondRowId] = await prepareKeyboardGrid(page, testInfo);
    });

    test("F2 opens the active cell for editing without a mouse", async ({ page }) => {
        const titleCell = taskRow(page, firstRowId).locator(
            "td[data-col='title']",
        );
        await selectAndFocusCell(titleCell);
        await page.keyboard.press("F2");
        await expect(titleCell.locator("input")).toBeVisible();
        await expect(titleCell.locator("input")).toBeFocused();
    });

    test("typing a printable character replaces the cell content and starts editing", async ({ page }) => {
        const titleCell = taskRow(page, firstRowId).locator(
            "td[data-col='title']",
        );
        await selectAndFocusCell(titleCell);
        await page.keyboard.press("X");
        await expect(titleCell.locator("input")).toHaveValue("X");
    });

    test("Enter commits the edit and moves the active cell down", async ({ page }) => {
        const firstRow = taskRow(page, firstRowId);
        const titleCell = firstRow.locator("td[data-col='title']");
        // A click on the display button already opens the editor (see TextCell).
        await titleCell.locator("button").click();
        await expect(titleCell.locator("input")).toBeFocused();
        await titleCell.locator("input").fill("Renamed via keyboard");
        await page.keyboard.press("Enter");

        await expect(titleCell.locator("input")).not.toBeVisible();
        await expect(titleCell.locator("button")).toHaveText("Renamed via keyboard", { timeout: 30000 });
        const secondRow = taskRow(page, secondRowId);
        await expect(secondRow.locator("td[data-col='title']")).toHaveClass(/grid-active/);
    });

    test("Escape cancels an in-progress edit and Tab commits + moves right instead", async ({ page }) => {
        const firstRow = taskRow(page, firstRowId);
        const titleCell = firstRow.locator("td[data-col='title']");
        const originalTitle = (await titleCell.locator("button").textContent())?.trim() ?? "";

        await titleCell.locator("button").click();
        await expect(titleCell.locator("input")).toBeFocused();
        await titleCell.locator("input").fill("Discarded edit");
        await page.keyboard.press("Escape");
        await expect(titleCell.locator("input")).not.toBeVisible();
        await expect(titleCell.locator("button")).toHaveText(originalTitle, { timeout: 30000 });

        await expect(titleCell.locator("button")).toBeFocused();
        await titleCell.locator("button").click();

        await expect(titleCell.locator("input")).toBeFocused();
        await titleCell.locator("input").fill("Committed via Tab");
        await page.keyboard.press("Tab");
        await expect(titleCell.locator("input")).not.toBeVisible({ timeout: 10000 });
        await expect(titleCell.locator("button")).toHaveText("Committed via Tab", { timeout: 30000 });
        await expect(firstRow.locator("td[data-col='status']")).toHaveClass(/grid-active/);
    });

    test("a focused select cell keeps native arrow-key behavior instead of navigating the grid", async ({ page }) => {
        const statusCell = taskRow(page, firstRowId).locator("td[data-col='status']");
        const select = statusCell.locator("select");
        await select.click();
        await expect(statusCell).toHaveClass(/grid-active/);

        await page.keyboard.press("ArrowDown");
        // Grid must not steal arrow keys from a focused native select, or move
        // the active cell away while the select still owns the keystroke.
        await expect(select).toBeFocused();
        await expect(statusCell).toHaveClass(/grid-active/);
    });
});
