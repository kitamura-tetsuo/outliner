/** @feature GRD-2f474991 */
import { expect, type Locator, type Page, test } from "@playwright/test";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
import { TestHelpers } from "../utils/testHelpers";
registerCoverageHooks();

/** Inserts a private "blank" preset Table+Grid (title text, done checkbox) on the first item, never touching the shared demo project. */
async function createBlankTableGrid(page: Page): Promise<Locator> {
    await page.locator(".outliner-item").first().click();
    await page.waitForTimeout(300);
    const addDatabaseBtn = page.getByTestId("main-toolbar").locator(".add-database-btn").last();
    await expect(addDatabaseBtn).toBeVisible({ timeout: 10000 });
    await addDatabaseBtn.click();
    const createPanel = page.getByTestId("yjs-table-create-panel").first();
    await expect(createPanel).toBeVisible({ timeout: 10000 });
    await createPanel.getByTestId("yjs-table-name-input").fill("ClipboardTest");
    await createPanel.getByTestId("yjs-table-preset-select").selectOption("blank");
    await createPanel.getByTestId("yjs-table-create").click();
    const grid = page.getByTestId("yjs-table-grid").first();
    await expect(grid.locator("th", { hasText: "title" })).toBeVisible({ timeout: 15000 });
    return grid;
}

/** Adds one row and gives it a distinctive title, via the row appended at the bottom. */
async function addRowWithTitle(page: Page, grid: Locator, title: string): Promise<void> {
    const countBefore = await grid.locator("tbody tr").count();
    await page.getByTestId("yjs-table-add-row").first().click();
    await expect(grid.locator("tbody tr")).toHaveCount(countBefore + 1, { timeout: 10000 });
    const row = grid.locator("tbody tr").last();
    await row.locator("td[data-col='title']").locator("button").click();
    await row.locator("td[data-col='title']").locator("input").fill(title);
    await page.keyboard.press("Enter");
    await expect(row.locator("td[data-col='title']").locator("button")).toHaveText(title, { timeout: 10000 });
}

test.describe("Grid cell-range clipboard copy (FTR-2f474991)", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
        await TestHelpers.seedProjectAndNavigate(page, testInfo, ["Clipboard Copy Test"]);
        await expect(page.locator(".outliner-item").first()).toBeVisible({ timeout: 10000 });
    });

    test("Ctrl+C on a single cell copies just its value, no header row", async ({ page }) => {
        const grid = await createBlankTableGrid(page);
        await addRowWithTitle(page, grid, "Alpha");
        const cell = grid.locator("tbody tr").nth(0).locator("td[data-col='title']");

        await cell.locator("button").click();
        await page.keyboard.press("Escape"); // leave edit mode, keep the cell active/focused
        await page.keyboard.press("Control+c");

        await expect.poll(() => page.evaluate(() => navigator.clipboard.readText()), { timeout: 10000 })
            .toBe("Alpha");
    });

    test("Ctrl+C on a rectangular range copies rows/columns as tab/newline text", async ({ page }) => {
        const grid = await createBlankTableGrid(page);
        await addRowWithTitle(page, grid, "Alpha");
        await addRowWithTitle(page, grid, "Beta");
        await grid.locator("tbody tr").nth(0).locator("td[data-col='done'] input").check();
        await grid.locator("tbody tr").nth(1).locator("td[data-col='done'] input").check();
        // The query result refreshes on a debounce after each Yjs write; give
        // it a moment before reading the value back off the rendered grid.
        await page.waitForTimeout(500);
        const firstTitle = grid.locator("tbody tr").nth(0).locator("td[data-col='title']");

        await firstTitle.locator("button").click();
        await page.keyboard.press("Escape");
        // Escape's refocus onto the cell's button is deferred a frame (see
        // `focusLogicalCell`'s `deferred` path); give it a moment so the
        // subsequent arrow keys land on the grid, not a mid-transition focus.
        await expect(firstTitle.locator("button")).toBeFocused({ timeout: 5000 });
        await page.keyboard.down("Shift");
        await page.keyboard.press("ArrowDown");
        await page.keyboard.press("ArrowRight");
        await page.keyboard.up("Shift");
        await expect(grid.locator("td.grid-selected")).toHaveCount(4);

        await page.keyboard.press("Control+c");

        // Row order is whatever the query returns, not necessarily insertion
        // order -- both rows are "true" here, so either ordering is correct.
        await expect.poll(() => page.evaluate(() => navigator.clipboard.readText()), { timeout: 10000 })
            .toMatch(/^(Alpha|Beta)\ttrue\n(Alpha|Beta)\ttrue$/);
    });

    test("Ctrl+C on a row selection copies its visible cells across every column", async ({ page }) => {
        const grid = await createBlankTableGrid(page);
        await addRowWithTitle(page, grid, "Alpha");
        await addRowWithTitle(page, grid, "Beta");
        // Row order is whatever the query returns, not insertion order -- locate
        // the row by its content rather than assuming a position.
        const alphaRow = grid.locator("tbody tr").filter({ hasText: "Alpha" });
        await alphaRow.locator("td[data-col='done'] input").check();
        await page.waitForTimeout(500);

        const rowHeader = alphaRow.locator("th[role='rowheader']");
        await rowHeader.click();
        await expect(rowHeader).toHaveClass(/header-selected/);

        await page.keyboard.press("Control+c");

        // Every visible column comes along, id included -- a row selection is
        // not scoped to "the columns the user happened to click".
        await expect.poll(() => page.evaluate(() => navigator.clipboard.readText()), { timeout: 10000 })
            .toMatch(/^[0-9a-f-]+\tAlpha\ttrue$/);
    });
});
