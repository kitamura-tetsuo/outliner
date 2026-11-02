/** @feature GRD-7e3a8c91 */
import { expect, test } from "@playwright/test";
import { readGridProjectState } from "../utils/crossProjectGridHelpers";
import { keyboardTaskRow, prepareKeyboardGrid, selectAndFocusCell } from "../utils/gridKeyboardFixture";
import { undoDepth } from "../utils/gridResizeHelpers";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();

test.describe("Grid Space pan terminal click ownership (#5863)", () => {
    let firstRowId: string;
    let secondRowId: string;

    test.beforeEach(async ({ page }, testInfo) => {
        [firstRowId, secondRowId] = await prepareKeyboardGrid(page, testInfo);
        const view = page.getByTestId("yjs-table-view");
        for (const column of ["id", "title", "status", "priority", "due_date", "repeat_days"]) {
            await view.getByTestId(`yjs-table-width-${column}`).fill("300");
            await view.getByTestId(`yjs-table-width-${column}`).press("Enter");
        }
    });

    test("zero-distance pan is inert and leaves the next click usable", async ({ page }) => {
        const grid = page.getByTestId("yjs-table-grid");
        const origin = keyboardTaskRow(page, firstRowId).locator("td[data-col='title']");
        const next = keyboardTaskRow(page, secondRowId).locator("td[data-col='title']");
        await selectAndFocusCell(origin);
        const selectionBefore = await selectedCellIdentity(grid);
        const stateBefore = await readGridProjectState(page);
        const undoBefore = await undoDepth(page);
        expect(undoBefore).toBeGreaterThanOrEqual(0);
        const box = (await origin.boundingBox())!;

        await page.keyboard.down("Space");
        await expect(origin.locator("input")).toHaveCount(0);
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await page.mouse.down();
        await page.mouse.up();
        await page.keyboard.up("Space");

        await expect(origin.locator("input")).toHaveCount(0);
        expect(await selectedCellIdentity(grid)).toEqual(selectionBefore);
        expect(await readGridProjectState(page)).toEqual(stateBefore);
        expect(await undoDepth(page)).toBe(undoBefore);

        await next.locator("button").click();
        await expect(next.locator("input")).toBeFocused();
    });

    test("active pan ownership survives right and middle button transitions", async ({ page }) => {
        const grid = page.getByTestId("yjs-table-grid");
        const origin = keyboardTaskRow(page, firstRowId).locator("td[data-col='title']");
        const next = keyboardTaskRow(page, secondRowId).locator("td[data-col='title']");

        for (const secondary of ["right", "middle"] as const) {
            await selectAndFocusCell(origin);
            const selectionBefore = await selectedCellIdentity(grid);
            const stateBefore = await readGridProjectState(page);
            const undoBefore = await undoDepth(page);
            const box = (await origin.boundingBox())!;
            const x = box.x + box.width / 2;
            const y = box.y + box.height / 2;

            await page.keyboard.down("Space");
            await page.mouse.move(x, y);
            await page.mouse.down({ button: "left" });
            await page.mouse.down({ button: secondary });
            await page.mouse.up({ button: secondary });
            await expect(page.locator(".context-menu-overlay")).toHaveCount(0);
            await expect(grid).toHaveClass(/pan-active/);
            const beforeMove = await grid.evaluate(element => element.scrollLeft);
            await page.mouse.move(x - 60, y, { steps: 2 });
            await expect.poll(() => grid.evaluate(element => element.scrollLeft)).toBeGreaterThan(beforeMove);
            await page.mouse.up({ button: "left" });
            await page.keyboard.up("Space");

            await expect(origin.locator("input")).toHaveCount(0);
            expect(await selectedCellIdentity(grid)).toEqual(selectionBefore);
            expect(await readGridProjectState(page)).toEqual(stateBefore);
            expect(await undoDepth(page)).toBe(undoBefore);
            await next.locator("button").click();
            await expect(next.locator("input")).toBeFocused();
            await next.locator("input").press("Escape");
        }
    });

    test("secondary button transition cannot discard a Space-first release guard", async ({ page }) => {
        const grid = page.getByTestId("yjs-table-grid");
        const origin = keyboardTaskRow(page, firstRowId).locator("td[data-col='title']");
        const next = keyboardTaskRow(page, secondRowId).locator("td[data-col='title']");
        await selectAndFocusCell(origin);
        const selectionBefore = await selectedCellIdentity(grid);
        const stateBefore = await readGridProjectState(page);
        const undoBefore = await undoDepth(page);
        const box = (await origin.boundingBox())!;
        const x = box.x + box.width / 2;
        const y = box.y + box.height / 2;

        await page.keyboard.down("Space");
        await page.mouse.move(x, y);
        await page.mouse.down({ button: "left" });
        await page.keyboard.up("Space");
        await page.mouse.down({ button: "right" });
        await page.mouse.up({ button: "right" });
        await expect(page.locator(".context-menu-overlay")).toHaveCount(0);
        await page.mouse.up({ button: "left" });

        await expect(origin.locator("input")).toHaveCount(0);
        expect(await selectedCellIdentity(grid)).toEqual(selectionBefore);
        expect(await readGridProjectState(page)).toEqual(stateBefore);
        expect(await undoDepth(page)).toBe(undoBefore);

        await next.locator("button").click();
        await expect(next.locator("input")).toBeFocused();
    });
});

function selectedCellIdentity(grid: import("@playwright/test").Locator): Promise<(string | null)[][]> {
    return grid.locator("td.grid-selected").evaluateAll(cells =>
        cells.map(cell => [cell.getAttribute("data-row-id"), cell.getAttribute("data-col")])
    );
}
