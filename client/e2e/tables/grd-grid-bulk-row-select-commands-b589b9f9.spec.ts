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

test.describe("Grid selection-aware Delete removes rows; bulk checkbox commit (FTR-b589b9f9)", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        await TestHelpers.seedProjectAndNavigate(page, testInfo, ["Bulk Grid Test"]);
        await expect(page.locator(".outliner-item").first()).toBeVisible({ timeout: 10000 });
    });

    test("Delete removes every selected row when a rows-kind selection is active (no confirmation configured)", async ({ page }) => {
        const grid = await createBlankTableGrid(page);
        await addRowWithTitle(page, grid, "Alpha");
        await addRowWithTitle(page, grid, "Beta");
        await addRowWithTitle(page, grid, "Gamma");

        await grid.getByRole("rowheader", { name: "Select row 1" }).click();
        await grid.getByRole("rowheader", { name: "Select row 2" }).click({ modifiers: ["Control"] });
        await expect(grid.locator("th.row-header.header-selected")).toHaveCount(2);

        await page.keyboard.press("Delete");

        await expect(grid.locator("tbody tr")).toHaveCount(1, { timeout: 15000 });
        await expect(grid.locator("tbody tr").first().locator("td[data-col='title'] button")).toHaveText("Gamma");
    });

    test("a Shift-click that extends a checkbox selection applies the new value to the whole selection", async ({ page }) => {
        const grid = await createBlankTableGrid(page);
        await addRowWithTitle(page, grid, "Alpha");
        await addRowWithTitle(page, grid, "Beta");
        await addRowWithTitle(page, grid, "Gamma");
        const rows = grid.locator("tbody tr");
        const doneCheckbox = (rowIndex: number) =>
            rows.nth(rowIndex).locator("td[data-col='done'] input[type=checkbox]");

        await expect(doneCheckbox(0)).not.toBeChecked();
        await expect(doneCheckbox(1)).not.toBeChecked();
        await expect(doneCheckbox(2)).not.toBeChecked();

        // A plain click both selects the cell and toggles it (native checkbox
        // behavior); a Shift-click extends the selection to include the newly
        // clicked cell *before* its own toggle commits, so that commit applies
        // to every writable cell the selection now covers.
        await doneCheckbox(0).click();
        await doneCheckbox(1).click({ modifiers: ["Shift"] });

        await expect(doneCheckbox(0)).toBeChecked({ timeout: 15000 });
        await expect(doneCheckbox(1)).toBeChecked({ timeout: 15000 });
        // The selection never covered the third row -- it is untouched.
        await expect(doneCheckbox(2)).not.toBeChecked();
    });
});
