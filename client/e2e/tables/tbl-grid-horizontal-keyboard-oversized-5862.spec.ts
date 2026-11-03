import { expect, test } from "@playwright/test";
import { keyboardTaskRow, prepareKeyboardGrid, selectAndFocusCell } from "../utils/gridKeyboardFixture";
import { gridRevealGeometry } from "../utils/gridRevealGeometry";
import { commitWidthsProduction, singleGridId } from "../utils/gridWidthHelpers";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();

test.describe("Grid oversized keyboard reveal (#5862)", () => {
    let firstRowId: string;

    test.beforeEach(async ({ page }, info) => {
        [firstRowId] = await prepareKeyboardGrid(page, info);
        await commitWidthsProduction(page, await singleGridId(page), {
            id: 500,
            title: 1400,
            status: 500,
            priority: 500,
            due_date: 500,
            repeat_days: 500,
        });
    });

    test("rightward entry aligns the left edge and an unchanged boundary key is stable", async ({ page }) => {
        const grid = page.getByTestId("yjs-table-grid");
        const row = keyboardTaskRow(page, firstRowId);
        const titleHeader = grid.locator("th[data-col='title']");
        const repeatHeader = grid.locator("th[data-col='repeat_days']");
        for (let i = 0; i < 4; i++) {
            await repeatHeader.focus();
            await repeatHeader.press("Alt+ArrowLeft");
        }
        await expect(grid.locator("th[data-col]").nth(1)).toHaveAttribute("data-col", "repeat_days");
        await expect(grid.locator("th[data-col]").nth(2)).toHaveAttribute("data-col", "title");

        const source = row.locator("td[data-col='repeat_days']");
        const target = row.locator("td[data-col='title']");
        await selectAndFocusCell(source);
        const before = await gridRevealGeometry(grid, target);
        expect(before.targetRight - before.targetLeft).toBeGreaterThan(before.clientWidth);
        await page.keyboard.press("ArrowRight");

        const entered = await gridRevealGeometry(grid, target);
        expect(Math.abs(entered.targetLeft - entered.gridLeft)).toBeLessThanOrEqual(1);
        await expect(target).toHaveClass(/grid-active/);
        await expect(target.locator("button")).toBeFocused();
        expect([entered.pageX, entered.pageY, entered.scrollTop]).toEqual([
            before.pageX,
            before.pageY,
            before.scrollTop,
        ]);

        // Put the oversized target at the outer edge, then prove a clamped
        // key does not realign the offset established by ordinary selection.
        for (let i = 0; i < 3; i++) {
            await titleHeader.focus();
            await titleHeader.press("Alt+ArrowRight");
        }
        await selectAndFocusCell(target);
        const edge = await gridRevealGeometry(grid, target);
        await page.keyboard.press("ArrowRight");
        expect((await gridRevealGeometry(grid, target)).scrollLeft).toBe(edge.scrollLeft);
    });

    test("leftward entry aligns the right edge and an unchanged boundary key is stable", async ({ page }) => {
        const grid = page.getByTestId("yjs-table-grid");
        const row = keyboardTaskRow(page, firstRowId);
        const titleHeader = grid.locator("th[data-col='title']");
        const repeatHeader = grid.locator("th[data-col='repeat_days']");
        await titleHeader.focus();
        await titleHeader.press("Alt+ArrowRight");
        await titleHeader.focus();
        await titleHeader.press("Alt+ArrowRight");
        await repeatHeader.focus();
        await repeatHeader.press("Alt+ArrowLeft");
        await expect(grid.locator("th[data-col]").nth(3)).toHaveAttribute("data-col", "title");
        await expect(grid.locator("th[data-col]").nth(4)).toHaveAttribute("data-col", "repeat_days");

        const source = row.locator("td[data-col='repeat_days']");
        const target = row.locator("td[data-col='title']");
        await selectAndFocusCell(source);
        const before = await gridRevealGeometry(grid, target);
        await page.keyboard.press("ArrowLeft");

        const entered = await gridRevealGeometry(grid, target);
        expect(Math.abs(entered.targetRight - entered.gridRight)).toBeLessThanOrEqual(1);
        await expect(target.locator("button")).toBeFocused();
        expect([entered.pageX, entered.pageY, entered.scrollTop]).toEqual([
            before.pageX,
            before.pageY,
            before.scrollTop,
        ]);

        for (let i = 0; i < 3; i++) {
            await titleHeader.focus();
            await titleHeader.press("Alt+ArrowLeft");
        }
        await selectAndFocusCell(target);
        const edge = await gridRevealGeometry(grid, target);
        await page.keyboard.press("ArrowLeft");
        expect((await gridRevealGeometry(grid, target)).scrollLeft).toBe(edge.scrollLeft);
    });
});
