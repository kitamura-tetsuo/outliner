/** @feature GRD-7e3a8c91 */
import { expect, test } from "@playwright/test";
import { readGridProjectState } from "../utils/crossProjectGridHelpers";
import { keyboardTaskRow, prepareKeyboardGrid, selectAndFocusCell } from "../utils/gridKeyboardFixture";
import { undoDepth } from "../utils/gridResizeHelpers";
import { readWidthGridRegistry } from "../utils/gridWidthHelpers";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();

async function setWideColumns(page: import("@playwright/test").Page): Promise<void> {
    const view = page.getByTestId("yjs-table-view").first();
    for (const column of ["id", "title", "status", "priority", "due_date", "repeat_days"]) {
        const input = view.getByTestId(`yjs-table-width-${column}`);
        await input.fill("300");
        await input.press("Enter");
    }
}

async function dragWhileHoldingSpace(
    page: import("@playwright/test").Page,
    target: import("@playwright/test").Locator,
    dx: number,
): Promise<void> {
    const box = (await target.boundingBox())!;
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;
    await page.keyboard.down("Space");
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + dx, y, { steps: 4 });
    await page.mouse.up();
    await page.keyboard.up("Space");
}

test.describe("Grid Space pan authoritative boundaries (#5863)", () => {
    test(
        "both directions clamp without changing selection, data, definition, vertical offset, or history",
        async ({ page }, info) => {
            const [firstRowId] = await prepareKeyboardGrid(page, info);
            await setWideColumns(page);
            const grid = page.getByTestId("yjs-table-grid");
            const cell = keyboardTaskRow(page, firstRowId).locator("td[data-col='title']");
            await selectAndFocusCell(cell);
            const beforeState = await readGridProjectState(page);
            const beforeUndo = await undoDepth(page);
            const beforeSelection = await grid.locator("td.grid-selected").evaluateAll(cells =>
                cells.map(cell => [cell.getAttribute("data-row-id"), cell.getAttribute("data-col")])
            );
            const beforeTop = await grid.evaluate(element => element.scrollTop);

            await dragWhileHoldingSpace(page, cell, -10_000);
            await expect.poll(() => grid.evaluate(element => element.scrollLeft)).toBe(
                await grid.evaluate(element => element.scrollWidth - element.clientWidth),
            );
            const rightmostCell = grid.locator("td[data-col='repeat_days']").first();
            await dragWhileHoldingSpace(page, rightmostCell, 10_000);
            expect(await grid.evaluate(element => element.scrollLeft)).toBe(0);

            expect(await grid.evaluate(element => element.scrollTop)).toBe(beforeTop);
            expect(
                await grid.locator("td.grid-selected").evaluateAll(cells =>
                    cells.map(cell => [cell.getAttribute("data-row-id"), cell.getAttribute("data-col")])
                ),
            ).toEqual(beforeSelection);
            expect(await readGridProjectState(page)).toEqual(beforeState);
            expect(await undoDepth(page)).toBe(beforeUndo);
        },
    );

    test("no-overflow and open-editor Space remain native no-op/input paths", async ({ page }, info) => {
        const [firstRowId] = await prepareKeyboardGrid(page, info);
        const grid = page.getByTestId("yjs-table-grid");
        const cell = keyboardTaskRow(page, firstRowId).locator("td[data-col='title']");
        await selectAndFocusCell(cell);
        await dragWhileHoldingSpace(page, cell, -120);
        expect(await grid.evaluate(element => element.scrollLeft)).toBe(0);

        await cell.locator("button").click();
        const editor = cell.locator("input");
        await editor.press("End");
        await editor.press("Space");
        await expect(editor).toHaveValue("Alpha ");
        await editor.press("Escape");
    });

    test("two placements keep browser scroll offsets isolated", async ({ page }, info) => {
        const [firstRowId] = await prepareKeyboardGrid(page, info);
        await setWideColumns(page);
        const gridId = (await readWidthGridRegistry(page))[0].gridId;
        await page.locator(".outliner-item[data-item-id]").last().click();
        await page.getByTestId("main-toolbar").locator(".add-database-btn").last().click();
        const panel = page.getByTestId("yjs-table-create-panel").last();
        await panel.getByRole("button", { name: "Existing Grid" }).click();
        await panel.getByTestId("yjs-grid-existing-select").selectOption(gridId);
        await panel.getByTestId("yjs-grid-select-existing").click();
        const grids = page.getByTestId("yjs-table-grid");
        await expect(grids).toHaveCount(2);

        const firstCell = grids.first().locator(`tr[data-record-id='${firstRowId}'] td[data-col='title']`);
        await selectAndFocusCell(firstCell);
        await dragWhileHoldingSpace(page, firstCell, -100);
        await expect.poll(() => grids.first().evaluate(element => element.scrollLeft)).toBeGreaterThan(0);
        expect(await grids.nth(1).evaluate(element => element.scrollLeft)).toBe(0);
    });
});
