/** @feature GRD-2f474991 */
import { devices, expect, type Locator, type Page, test } from "@playwright/test";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
import { TestHelpers } from "../utils/testHelpers";
import { TouchGestures } from "../utils/touchGestures";
registerCoverageHooks();

test.use({ ...devices["Pixel 7"], hasTouch: true });

/** Inserts a private "blank" preset Table+Grid (title text, done checkbox) on the first item, never touching the shared demo project. */
async function createBlankTableGrid(page: Page): Promise<Locator> {
    await page.locator(".outliner-item").first().click();
    await page.waitForTimeout(300);
    const addDatabaseBtn = page.getByTestId("main-toolbar").locator(".add-database-btn").last();
    await expect(addDatabaseBtn).toBeVisible({ timeout: 10000 });
    await addDatabaseBtn.click();
    const createPanel = page.getByTestId("yjs-table-create-panel").first();
    await expect(createPanel).toBeVisible({ timeout: 10000 });
    await createPanel.getByTestId("yjs-table-name-input").fill("ClipboardMobileTest");
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

test.describe("Grid clipboard via the mobile contextual toolbar (FTR-2f474991)", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
        await TestHelpers.seedProjectAndNavigate(page, testInfo, ["Clipboard Mobile Test"]);
        await expect(page.locator(".outliner-item").first()).toBeVisible({ timeout: 10000 });
    });

    test("a long-press then the toolbar's Copy button copies the active cell", async ({ page }) => {
        const grid = await createBlankTableGrid(page);
        await addRowWithTitle(page, grid, "Alpha");
        const cell = grid.locator("tbody tr").nth(0).locator("td[data-col='title']");
        const box = await cell.boundingBox();
        expect(box).not.toBeNull();

        await TouchGestures.longPress(page, TouchGestures.pointInBox(box!, 0.5));
        const toolbar = page.getByRole("toolbar", { name: "Grid selection actions" });
        await expect(toolbar).toBeVisible({ timeout: 10000 });

        await toolbar.getByRole("button", { name: "Copy" }).click();

        await expect.poll(() => page.evaluate(() => navigator.clipboard.readText()), { timeout: 10000 })
            .toBe("Alpha");
    });

    test("a long-press then the toolbar's Paste button applies the clipboard to the active cell", async ({ page }) => {
        const grid = await createBlankTableGrid(page);
        await addRowWithTitle(page, grid, "Alpha");
        await page.evaluate(() => navigator.clipboard.writeText("Mobile"));
        const cell = grid.locator("tbody tr").nth(0).locator("td[data-col='title']");
        const box = await cell.boundingBox();
        expect(box).not.toBeNull();

        await TouchGestures.longPress(page, TouchGestures.pointInBox(box!, 0.5));
        const toolbar = page.getByRole("toolbar", { name: "Grid selection actions" });
        await expect(toolbar).toBeVisible({ timeout: 10000 });

        await toolbar.getByRole("button", { name: "Paste" }).click();

        // The touch-selection resize handles are buttons in this same cell
        // too; scope to the cell's own value control.
        await expect(cell.locator("button.cell-value")).toHaveText("Mobile", { timeout: 10000 });
    });
});
