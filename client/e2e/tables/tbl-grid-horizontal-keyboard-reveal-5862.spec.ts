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
        expect(
            Math.abs(
                (right.scrollLeft - initial.scrollLeft) - (clippedTarget.targetRight - clippedTarget.gridRight),
            ),
        ).toBeLessThanOrEqual(1);
        expect(right.pageX).toBe(initial.pageX);
        expect(right.pageY).toBe(initial.pageY);

        await selectAndFocusCell(row.locator("td[data-col='title']"));
        await page.keyboard.press("Shift+ArrowLeft");
        const endpoint = await geometry(page, "repeat_days");
        expect(endpoint.targetLeft).toBeGreaterThanOrEqual(endpoint.gridLeft - 1);
        await expect(grid.locator("td.grid-selected")).toHaveCount(2);
        await expect(row.locator("td[data-col='repeat_days']")).toHaveClass(/grid-active/);
        await expect(row.locator("td[data-col='title']")).toHaveClass(/grid-selected/);

        await page.keyboard.press("Shift+ArrowRight");
        await expect(row.locator("td[data-col='title']")).toHaveClass(/grid-active/);

        // Exercise the reverse Tab direction from a genuinely focusable
        // control; the hidden ID control is never enabled for navigation.
        await selectAndFocusCell(row.locator("td[data-col='title']"));
        await page.keyboard.press("Shift+Tab");
        await expect(row.locator("td[data-col='repeat_days']")).toHaveClass(/grid-active/);
        const reverseTab = await geometry(page, "repeat_days");
        expect(reverseTab.targetLeft).toBeGreaterThanOrEqual(reverseTab.gridLeft - 1);
    });

    test("Tab wraps while keeping the target visible and leaves page offsets unchanged", async ({ page }) => {
        const firstRow = taskRow(page, firstRowId);
        // Restore repeat_days to the final displayed position so the existing
        // Tab rule wraps to the first column of the following row.
        const repeatHeader = page.getByTestId("yjs-table-grid").locator("th[data-col='repeat_days']");
        for (let i = 0; i < 4; i++) {
            await repeatHeader.focus();
            await repeatHeader.press("Alt+ArrowRight");
        }
        await expect(page.getByTestId("yjs-table-grid").locator("th[data-col]").last()).toHaveAttribute(
            "data-col",
            "repeat_days",
        );
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

        // The ID control is intentionally disabled. The logical target is
        // revealed without inventing focus eligibility for that control.
        const idControl = secondRow.locator("td[data-col='id'] button");
        await expect(idControl).toBeDisabled();
        await expect(idControl).not.toBeFocused();
    });

    test("an already-contained target does not move the Grid or page", async ({ page }) => {
        const gridId = await singleGridId(page);
        await commitWidthsProduction(page, gridId, {
            id: 100,
            title: 100,
            status: 100,
            priority: 100,
            due_date: 100,
            repeat_days: 100,
        });
        const row = taskRow(page, firstRowId);
        await selectAndFocusCell(row.locator("td[data-col='repeat_days']"));
        const before = await geometry(page, "repeat_days");
        const targetBefore = await geometry(page, "title");
        expect(targetBefore.targetLeft).toBeGreaterThanOrEqual(targetBefore.gridLeft - 1);
        expect(targetBefore.targetRight).toBeLessThanOrEqual(targetBefore.gridRight + 1);

        await page.keyboard.press("ArrowRight");
        await expect(row.locator("td[data-col='title']")).toHaveClass(/grid-active/);
        const after = await geometry(page, "title");
        expect(after.scrollLeft).toBe(before.scrollLeft);
        expect([after.pageX, after.pageY]).toEqual([before.pageX, before.pageY]);
    });
});
