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
    await createPanel.getByTestId("yjs-table-name-input").fill("ClipboardPasteTest");
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

async function setClipboardText(page: Page, text: string): Promise<void> {
    await page.evaluate((value) => navigator.clipboard.writeText(value), text);
}

test.describe("Grid cell-range clipboard paste (FTR-2f474991)", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
        await TestHelpers.seedProjectAndNavigate(page, testInfo, ["Clipboard Paste Test"]);
        await expect(page.locator(".outliner-item").first()).toBeVisible({ timeout: 10000 });
    });

    test("one copied cell pasted onto a multi-cell selection repeats the value", async ({ page }) => {
        const grid = await createBlankTableGrid(page);
        await addRowWithTitle(page, grid, "Alpha");
        await addRowWithTitle(page, grid, "Beta");
        const firstTitle = grid.locator("tbody tr").nth(0).locator("td[data-col='title']");

        await firstTitle.locator("button").click();
        await page.keyboard.press("Escape");
        // Escape's refocus onto the cell's button is deferred a frame (see
        // `focusLogicalCell`'s `deferred` path); give it a moment so the
        // subsequent arrow key lands on the grid, not a mid-transition focus.
        await expect(firstTitle.locator("button")).toBeFocused({ timeout: 5000 });
        await page.keyboard.down("Shift");
        await page.keyboard.press("ArrowDown");
        await page.keyboard.up("Shift");
        await expect(grid.locator("td.grid-selected")).toHaveCount(2);

        await setClipboardText(page, "Zed");
        await page.keyboard.press("Control+v");

        await expect(grid.locator("tbody tr").nth(0).locator("td[data-col='title'] button")).toHaveText("Zed", {
            timeout: 10000,
        });
        await expect(grid.locator("tbody tr").nth(1).locator("td[data-col='title'] button")).toHaveText("Zed", {
            timeout: 10000,
        });
    });

    test("a rectangular source pasted at one active cell fills the corresponding rectangle", async ({ page }) => {
        const grid = await createBlankTableGrid(page);
        await addRowWithTitle(page, grid, "Alpha");
        await addRowWithTitle(page, grid, "Beta");
        const firstTitle = grid.locator("tbody tr").nth(0).locator("td[data-col='title']");

        await firstTitle.locator("button").click();
        await page.keyboard.press("Escape");

        await setClipboardText(page, "X\ttrue\nY\tfalse");
        await page.keyboard.press("Control+v");

        await expect(grid.locator("tbody tr").nth(0).locator("td[data-col='title'] button")).toHaveText("X", {
            timeout: 10000,
        });
        await expect(grid.locator("tbody tr").nth(0).locator("td[data-col='done'] input")).toBeChecked();
        await expect(grid.locator("tbody tr").nth(1).locator("td[data-col='title'] button")).toHaveText("Y", {
            timeout: 10000,
        });
        await expect(grid.locator("tbody tr").nth(1).locator("td[data-col='done'] input")).not.toBeChecked();
    });

    test("rejects an ambiguous shape mismatch rather than truncating, mutating nothing", async ({ page }) => {
        const grid = await createBlankTableGrid(page);
        await addRowWithTitle(page, grid, "Alpha");
        await addRowWithTitle(page, grid, "Beta");
        const firstTitle = grid.locator("tbody tr").nth(0).locator("td[data-col='title']");

        await firstTitle.locator("button").click();
        await page.keyboard.press("Escape");
        await expect(firstTitle.locator("button")).toBeFocused({ timeout: 5000 });
        await page.keyboard.down("Shift");
        await page.keyboard.press("ArrowDown");
        await page.keyboard.up("Shift");
        await expect(grid.locator("td.grid-selected")).toHaveCount(2);

        // Three rows cannot tile into a 2-row target.
        await setClipboardText(page, "A\nB\nC");
        await page.keyboard.press("Control+v");

        await expect(page.getByTestId("grid-paste-status")).toBeVisible({ timeout: 10000 });
        await expect(grid.locator("tbody tr").nth(0).locator("td[data-col='title'] button")).toHaveText("Alpha");
        await expect(grid.locator("tbody tr").nth(1).locator("td[data-col='title'] button")).toHaveText("Beta");
    });
});
