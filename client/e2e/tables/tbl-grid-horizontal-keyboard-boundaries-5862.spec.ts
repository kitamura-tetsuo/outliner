import { expect, test } from "@playwright/test";
import { keyboardTaskRow, prepareKeyboardGrid, selectAndFocusCell } from "../utils/gridKeyboardFixture";
import { addExistingGridPlacement, gridRevealGeometry } from "../utils/gridRevealGeometry";
import { commitWidthsProduction, singleGridId } from "../utils/gridWidthHelpers";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();

const WIDTHS = { id: 500, title: 500, status: 260, priority: 260, due_date: 260, repeat_days: 500 };

test.describe("Grid keyboard reveal boundaries (#5862)", () => {
    test("reveals only the initiating placement without moving page or ancestor offsets", async ({ page }, info) => {
        const [firstRowId] = await prepareKeyboardGrid(page, info);
        const gridId = await singleGridId(page);
        await commitWidthsProduction(page, gridId, WIDTHS);
        await addExistingGridPlacement(page, gridId);
        const grids = page.getByTestId("yjs-table-grid");
        const initiating = grids.first();
        const other = grids.nth(1);
        const row = initiating.locator(`tr[data-record-id='${firstRowId}']`);
        const repeatHeader = initiating.locator("th[data-col='repeat_days']");
        for (let i = 0; i < 4; i++) {
            await repeatHeader.focus();
            await repeatHeader.press("Alt+ArrowLeft");
        }
        const source = row.locator("td[data-col='repeat_days']");
        const target = row.locator("td[data-col='title']");
        await selectAndFocusCell(source);
        const before = await gridRevealGeometry(initiating, target);
        const otherBefore = await other.evaluate(element => [element.scrollLeft, element.scrollTop]);
        const ancestorsBefore = await initiating.evaluate(element => {
            const out: Array<[number, number]> = [];
            for (let parent = element.parentElement; parent; parent = parent.parentElement) {
                out.push([parent.scrollLeft, parent.scrollTop]);
            }
            return out;
        });

        await page.keyboard.press("ArrowRight");
        const after = await gridRevealGeometry(initiating, target);
        expect(after.targetRight).toBeLessThanOrEqual(after.gridRight + 1);
        expect(after.scrollLeft).toBeGreaterThan(before.scrollLeft);
        expect([after.pageX, after.pageY, after.scrollTop]).toEqual([before.pageX, before.pageY, before.scrollTop]);
        expect(await other.evaluate(element => [element.scrollLeft, element.scrollTop])).toEqual(otherBefore);
        expect(
            await initiating.evaluate(element => {
                const out: Array<[number, number]> = [];
                for (let parent = element.parentElement; parent; parent = parent.parentElement) {
                    out.push([parent.scrollLeft, parent.scrollTop]);
                }
                return out;
            }),
        ).toEqual(ancestorsBefore);
        await expect(target.locator("button")).toBeFocused();
    });

    test("Shift+Tab wraps backward with exact row and focus while preserving offsets", async ({ page }, info) => {
        const [firstRowId, secondRowId] = await prepareKeyboardGrid(page, info);
        const grid = page.getByTestId("yjs-table-grid");
        await commitWidthsProduction(page, await singleGridId(page), WIDTHS);
        const firstRow = keyboardTaskRow(page, firstRowId);
        const secondRow = keyboardTaskRow(page, secondRowId);
        await selectAndFocusCell(firstRow.locator("td[data-col='repeat_days']"));
        await page.keyboard.press("Tab");
        await expect(secondRow.locator("td[data-col='id']")).toHaveClass(/grid-active/);
        const before = await gridRevealGeometry(grid, firstRow.locator("td[data-col='repeat_days']"));

        await page.keyboard.press("Shift+Tab");
        const after = await gridRevealGeometry(grid, firstRow.locator("td[data-col='repeat_days']"));
        await expect(firstRow.locator("td[data-col='repeat_days']")).toHaveClass(/grid-active/);
        await expect(firstRow.locator("td[data-col='repeat_days'] button")).toBeFocused();
        await expect(secondRow.locator("td.grid-active")).toHaveCount(0);
        expect(after.targetLeft).toBeGreaterThanOrEqual(after.gridLeft - 1);
        expect(after.targetRight).toBeLessThanOrEqual(after.gridRight + 1);
        expect([after.pageX, after.pageY]).toEqual([before.pageX, before.pageY]);
    });

    test("a newer header focus supersedes deferred edit-exit focus", async ({ page }, info) => {
        const [firstRowId] = await prepareKeyboardGrid(page, info);
        const grid = page.getByTestId("yjs-table-grid");
        const cell = keyboardTaskRow(page, firstRowId).locator("td[data-col='title']");
        await cell.locator("button").click();
        await expect(cell.locator("input")).toBeFocused();
        await cell.locator("input").press("Tab");
        const header = grid.locator("th[data-col='title']");
        await header.focus();
        await page.waitForTimeout(100);
        await expect(header).toBeFocused();
    });
});
