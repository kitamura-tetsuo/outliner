import { expect, test } from "@playwright/test";
import { keyboardTaskRow, prepareKeyboardGrid, selectAndFocusCell } from "../utils/gridKeyboardFixture";
import { gridRevealGeometry } from "../utils/gridRevealGeometry";
import { commitWidthsProduction, singleGridId } from "../utils/gridWidthHelpers";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();

test.describe("Grid leftward keyboard reveal (#5862)", () => {
    test(
        "preserves a contained fitting target and minimally reveals a clipped fitting target",
        async ({ page }, info) => {
            const [firstRowId] = await prepareKeyboardGrid(page, info);
            const grid = page.getByTestId("yjs-table-grid");
            await commitWidthsProduction(page, await singleGridId(page), {
                id: 500,
                title: 500,
                status: 260,
                priority: 260,
                due_date: 260,
                repeat_days: 500,
            });

            const repeatHeader = grid.locator("th[data-col='repeat_days']");
            for (let i = 0; i < 4; i++) {
                await repeatHeader.focus();
                await repeatHeader.press("Alt+ArrowLeft");
            }
            await expect(grid.locator("th[data-col]").nth(1)).toHaveAttribute("data-col", "repeat_days");
            await expect(grid.locator("th[data-col]").nth(2)).toHaveAttribute("data-col", "title");

            const row = keyboardTaskRow(page, firstRowId);
            const source = row.locator("td[data-col='title']");
            const target = row.locator("td[data-col='repeat_days']");
            await selectAndFocusCell(source);

            // Genuine wheel input establishes an overflowing viewport in which
            // the fitting leftward target is already fully contained.
            let targetGeometry = await gridRevealGeometry(grid, target);
            expect(targetGeometry.scrollWidth).toBeGreaterThan(targetGeometry.clientWidth);
            expect(targetGeometry.targetRight - targetGeometry.targetLeft).toBeLessThanOrEqual(
                targetGeometry.clientWidth,
            );
            while (targetGeometry.targetLeft < targetGeometry.gridLeft - 1) {
                const previousScroll = targetGeometry.scrollLeft;
                await grid.hover();
                await page.mouse.wheel(-80, 0);
                await expect.poll(async () => (await gridRevealGeometry(grid, target)).scrollLeft).toBeLessThan(
                    previousScroll,
                );
                targetGeometry = await gridRevealGeometry(grid, target);
            }
            expect(targetGeometry.targetRight).toBeLessThanOrEqual(targetGeometry.gridRight + 1);

            const containedScroll = targetGeometry.scrollLeft;
            await page.keyboard.press("ArrowLeft");
            const contained = await gridRevealGeometry(grid, target);
            expect(contained.scrollLeft).toBe(containedScroll);
            await expect(target).toHaveClass(/grid-active/);
            await expect(target.locator("button")).toBeFocused();
            await expect(grid.locator("td.grid-selected")).toHaveCount(1);
            await expect(grid.locator("td.grid-selected")).toHaveAttribute("data-col", "repeat_days");
            await expect(grid.locator("td.grid-selected")).toHaveAttribute("data-record-id", firstRowId);

            // Return to the right-hand source, then move the viewport with real
            // wheel input until the same fitting target is clipped on the left.
            await page.keyboard.press("ArrowRight");
            await expect(source.locator("button")).toBeFocused();
            let clipped = await gridRevealGeometry(grid, target);
            while (clipped.targetLeft >= clipped.gridLeft - 1) {
                const previousScroll = clipped.scrollLeft;
                await grid.hover();
                await page.mouse.wheel(80, 0);
                await expect.poll(async () => (await gridRevealGeometry(grid, target)).scrollLeft).toBeGreaterThan(
                    previousScroll,
                );
                clipped = await gridRevealGeometry(grid, target);
            }
            expect(clipped.targetRight).toBeGreaterThan(clipped.gridLeft);

            const clippedDistance = clipped.gridLeft - clipped.targetLeft;
            await page.keyboard.press("ArrowLeft");
            const revealed = await gridRevealGeometry(grid, target);
            expect(revealed.targetLeft).toBeGreaterThanOrEqual(revealed.gridLeft - 1);
            expect(Math.abs((clipped.scrollLeft - revealed.scrollLeft) - clippedDistance)).toBeLessThanOrEqual(1);
            await expect(target).toHaveClass(/grid-active/);
            await expect(target.locator("button")).toBeFocused();
            await expect(grid.locator("td.grid-selected")).toHaveCount(1);
            await expect(grid.locator("td.grid-selected")).toHaveAttribute("data-col", "repeat_days");
            await expect(grid.locator("td.grid-selected")).toHaveAttribute("data-record-id", firstRowId);
        },
    );
});
