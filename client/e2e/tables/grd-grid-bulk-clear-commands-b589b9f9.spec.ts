/** @feature FTR-b589b9f9 */
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
    await createPanel.getByTestId("yjs-table-name-input").fill("BulkTest");
    // The create panel defaults to the "Tasks" preset (no boolean column);
    // this file needs the "Table" (blank) preset's `title`/`done` columns.
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

test.describe("Grid selection-aware Delete/Backspace clears cells (FTR-b589b9f9)", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        await TestHelpers.seedProjectAndNavigate(page, testInfo, ["Bulk Grid Test"]);
        await expect(page.locator(".outliner-item").first()).toBeVisible({ timeout: 10000 });
    });

    test("Delete clears a cell/range selection's writable contents instead of removing the records", async ({ page }) => {
        const grid = await createBlankTableGrid(page);
        await addRowWithTitle(page, grid, "Alpha");
        await addRowWithTitle(page, grid, "Beta");
        const firstRow = grid.locator("tbody tr").nth(0);
        const secondRow = grid.locator("tbody tr").nth(1);

        await firstRow.locator("td[data-col='title']").locator("button").click();
        await page.keyboard.press("Escape");
        await expect(firstRow.locator("td[data-col='title']")).toHaveClass(/grid-active/);

        await page.keyboard.down("Shift");
        await page.keyboard.press("ArrowDown");
        await page.keyboard.up("Shift");
        // Ensure Playwright waits until the selection renders before pressing Delete
        await expect(grid.locator("td.grid-selected")).toHaveCount(2, { timeout: 10000 });

        await page.keyboard.press("Delete");

        await expect(firstRow.locator("td[data-col='title']").locator("button")).toHaveText("", { timeout: 15000 });
        await expect(secondRow.locator("td[data-col='title']").locator("button")).toHaveText("", { timeout: 15000 });
        // No record was removed -- only its content was cleared.
        await expect(grid.locator("tbody tr")).toHaveCount(2);
    });

    test("Backspace clears an entire selected column, leaving other columns untouched", async ({ page }) => {
        const grid = await createBlankTableGrid(page);
        await addRowWithTitle(page, grid, "Alpha");
        await addRowWithTitle(page, grid, "Beta");
        await addRowWithTitle(page, grid, "Gamma");

        const titleHeader = grid.locator("th[role='columnheader']", { hasText: "title" });
        await titleHeader.click();
        await expect(titleHeader).toHaveClass(/header-selected/);

        await page.keyboard.press("Backspace");

        const titleButtons = grid.locator("tbody tr td[data-col='title'] button");
        for (const button of await titleButtons.all()) {
            await expect(button).toHaveText("", { timeout: 15000 });
        }
        // A different column was never part of the selection.
        for (const checkbox of await grid.locator("tbody tr td[data-col='done'] input").all()) {
            await expect(checkbox).not.toBeChecked();
        }
    });

    test("Delete on a select-all selection clears cells but never removes every record", async ({ page }) => {
        const grid = await createBlankTableGrid(page);
        await addRowWithTitle(page, grid, "Alpha");
        await addRowWithTitle(page, grid, "Beta");

        const corner = grid.getByRole("columnheader", { name: "Select current query result" });
        await corner.click();
        await expect(corner).toHaveAttribute("aria-selected", "true");

        await page.keyboard.press("Delete");

        await expect(grid.locator("tbody tr")).toHaveCount(2, { timeout: 15000 });
        const titleButtons = grid.locator("tbody tr td[data-col='title'] button");
        for (const button of await titleButtons.all()) {
            await expect(button).toHaveText("", { timeout: 15000 });
        }
    });
});
