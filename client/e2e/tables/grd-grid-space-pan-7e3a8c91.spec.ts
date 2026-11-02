/** @feature GRD-7e3a8c91 */
import { expect, test } from "@playwright/test";
import { keyboardTaskRow, prepareKeyboardGrid, selectAndFocusCell } from "../utils/gridKeyboardFixture";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();

async function makeGridOverflow(page: import("@playwright/test").Page): Promise<void> {
    const view = page.getByTestId("yjs-table-view");
    for (const column of ["id", "title", "status", "priority", "due_date", "repeat_days"]) {
        const width = view.getByTestId(`yjs-table-width-${column}`);
        await width.fill("300");
        await width.press("Enter");
    }
    const grid = page.getByTestId("yjs-table-grid");
    await expect.poll(() => grid.evaluate(element => element.scrollWidth > element.clientWidth)).toBe(true);
}

test.describe("Grid Space + left-drag horizontal pan (#5863)", () => {
    let firstRowId: string;
    let secondRowId: string;

    test.beforeEach(async ({ page }, testInfo) => {
        [firstRowId, secondRowId] = await prepareKeyboardGrid(page, testInfo);
        await makeGridOverflow(page);
    });

    test("real Space and mouse input pans without editing or selecting", async ({ page }) => {
        const grid = page.getByTestId("yjs-table-grid");
        const cell = keyboardTaskRow(page, firstRowId).locator("td[data-col='title']");
        await selectAndFocusCell(cell);
        const selectedBefore = await grid.locator("td.grid-selected").count();
        const pageXBefore = await page.evaluate(() => scrollX);

        await page.keyboard.down("Space");
        await expect(grid).toHaveClass(/pan-armed/);
        await expect(cell.locator("input")).toHaveCount(0);
        await expect(grid.locator("td.grid-selected")).toHaveCount(selectedBefore);

        const box = (await cell.boundingBox())!;
        const x = box.x + box.width / 2;
        const y = box.y + box.height / 2;
        await page.mouse.move(x, y);
        await page.mouse.down();
        await expect(grid).toHaveClass(/pan-active/);
        await page.mouse.move(x - 120, y, { steps: 4 });
        await expect.poll(() => grid.evaluate(element => element.scrollLeft)).toBeGreaterThan(0);
        expect(await page.evaluate(() => scrollX)).toBe(pageXBefore);
        await expect(grid.locator("td.grid-selected")).toHaveCount(selectedBefore);
        await expect(cell.locator("input")).toHaveCount(0);

        await page.mouse.up();
        await expect(grid).not.toHaveClass(/pan-active/);
        await expect(grid).toHaveClass(/pan-armed/);
        await page.keyboard.up("Space");
        await expect(grid).not.toHaveClass(/pan-armed/);
    });

    test("Space-first release stops movement, eats its click, and not the next click", async ({ page }) => {
        const grid = page.getByTestId("yjs-table-grid");
        const origin = keyboardTaskRow(page, firstRowId).locator("td[data-col='title']");
        const next = keyboardTaskRow(page, secondRowId).locator("td[data-col='title']");
        await selectAndFocusCell(origin);
        const box = (await origin.boundingBox())!;
        const x = box.x + box.width / 2;
        const y = box.y + box.height / 2;

        await page.keyboard.down("Space");
        await page.mouse.move(x, y);
        await page.mouse.down();
        await page.mouse.move(x - 80, y, { steps: 3 });
        await page.keyboard.up("Space");
        const stoppedAt = await grid.evaluate(element => element.scrollLeft);
        await page.mouse.move(x - 150, y, { steps: 3 });
        expect(await grid.evaluate(element => element.scrollLeft)).toBe(stoppedAt);
        await page.mouse.up();
        await expect(origin.locator("input")).toHaveCount(0);

        await next.locator("button").click();
        await expect(next.locator("input")).toBeFocused();
    });
});
