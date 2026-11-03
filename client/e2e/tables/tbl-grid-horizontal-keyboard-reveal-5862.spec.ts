import { expect, test } from "@playwright/test";
import { keyboardTaskRow as taskRow, prepareKeyboardGrid, selectAndFocusCell } from "../utils/gridKeyboardFixture";
import { commitWidthsProduction, singleGridId } from "../utils/gridWidthHelpers";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();

interface Geometry {
    gridLeft: number;
    gridRight: number;
    scrollLeft: number;
    pageX: number;
    pageY: number;
    targetLeft: number;
    targetRight: number;
}

test.describe("Grid horizontal keyboard reveal (#5862)", () => {
    let firstRowId: string;

    test.beforeEach(async ({ page }, testInfo) => {
        [firstRowId] = await prepareKeyboardGrid(page, testInfo);
        const gridId = await singleGridId(page);
        await commitWidthsProduction(page, gridId, {
            id: 500,
            title: 500,
            status: 260,
            priority: 260,
            due_date: 260,
            repeat_days: 500,
        });
        await expect(page.getByTestId("yjs-table-grid").locator("th[data-col='title']")).toHaveCSS("width", "500px");
        // Put the two focusable display cells next to each other through the
        // production keyboard column-reorder command. Native controls between
        // them intentionally retain their own Arrow keys.
        const repeatHeader = page.getByTestId("yjs-table-grid").locator("th[data-col='repeat_days']");
        for (let i = 0; i < 4; i++) {
            await repeatHeader.focus();
            await repeatHeader.press("Alt+ArrowLeft");
        }
    });

    async function geometry(page: import("@playwright/test").Page, column: string): Promise<Geometry> {
        const grid = page.getByTestId("yjs-table-grid");
        const target = taskRow(page, firstRowId).locator(`td[data-col='${column}']`);
        return grid.evaluate((element, targetElement) => {
            const viewport = element.getBoundingClientRect();
            const cell = (targetElement as HTMLElement).getBoundingClientRect();
            return {
                gridLeft: viewport.left + element.clientLeft,
                gridRight: viewport.left + element.clientLeft + element.clientWidth,
                scrollLeft: element.scrollLeft,
                pageX: globalThis.scrollX,
                pageY: globalThis.scrollY,
                targetLeft: cell.left,
                targetRight: cell.right,
            };
        }, await target.elementHandle());
    }

    test("Arrow and Shift+Arrow reveal the active endpoint with minimum local scrolling", async ({ page }) => {
        const grid = page.getByTestId("yjs-table-grid");
        const row = taskRow(page, firstRowId);
        await selectAndFocusCell(row.locator("td[data-col='repeat_days']"));
        const initial = await geometry(page, "repeat_days");

        const clippedTarget = await geometry(page, "title");
        await page.keyboard.press("ArrowRight");
        await expect(row.locator("td[data-col='title']")).toHaveClass(/grid-active/);
        const right = await geometry(page, "title");
        expect(right.targetRight).toBeLessThanOrEqual(right.gridRight + 1);
        expect(right.scrollLeft).toBeGreaterThan(initial.scrollLeft);
        expect(right.scrollLeft - initial.scrollLeft).toBeCloseTo(
            clippedTarget.targetRight - clippedTarget.gridRight,
            0,
        );
        expect(right.pageX).toBe(initial.pageX);
        expect(right.pageY).toBe(initial.pageY);

        await selectAndFocusCell(row.locator("td[data-col='title']"));
        await page.keyboard.press("Shift+ArrowLeft");
        const endpoint = await geometry(page, "repeat_days");
        expect(endpoint.targetLeft).toBeGreaterThanOrEqual(endpoint.gridLeft - 1);
        await expect(grid.locator("td.grid-selected")).toHaveCount(2);

        const beforeContainedMove = endpoint.scrollLeft;
        await page.keyboard.press("Shift+ArrowRight");
        await expect(row.locator("td[data-col='title']")).toHaveClass(/grid-active/);
        expect((await geometry(page, "title")).scrollLeft).toBe(beforeContainedMove);
    });

    test("Tab wraps while keeping the target visible and leaves page offsets unchanged", async ({ page }) => {
        const firstRow = taskRow(page, firstRowId);
        await selectAndFocusCell(firstRow.locator("td[data-col='repeat_days']"));
        const before = await geometry(page, "repeat_days");
        await page.keyboard.press("Tab");

        const secondRow = page.getByTestId("yjs-table-grid").locator("tbody tr").nth(1);
        await expect(secondRow.locator("td[data-col='id']")).toHaveClass(/grid-active/);
        const gridBox = await page.getByTestId("yjs-table-grid").boundingBox();
        const cellBox = await secondRow.locator("td[data-col='id']").boundingBox();
        expect(cellBox!.x).toBeGreaterThanOrEqual(gridBox!.x - 1);
        expect(await page.evaluate(() => [globalThis.scrollX, globalThis.scrollY])).toEqual([
            before.pageX,
            before.pageY,
        ]);

        await page.keyboard.press("Shift+Tab");
        await expect(firstRow.locator("td[data-col='repeat_days']")).toHaveClass(/grid-active/);
        const wrappedBack = await geometry(page, "repeat_days");
        expect(wrappedBack.targetLeft).toBeGreaterThanOrEqual(wrappedBack.gridLeft - 1);
        expect(await page.evaluate(() => [globalThis.scrollX, globalThis.scrollY])).toEqual([
            before.pageX,
            before.pageY,
        ]);
    });
});
