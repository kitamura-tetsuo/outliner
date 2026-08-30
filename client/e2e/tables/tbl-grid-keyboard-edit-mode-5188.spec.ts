import { expect, test } from "@playwright/test";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();

test.describe("Grid keyboard edit mode (#5188)", () => {
    test.beforeEach(async ({ page }) => {
        await page.goto("/demo/-/grids/demo-table-routine-occurrences-grid");
        const gridView = page.getByTestId("yjs-table-view");
        await expect(gridView).toBeVisible({ timeout: 30000 });
        const tbody = gridView.getByTestId("yjs-table-grid").locator("tbody");
        await tbody.locator("tr").first().waitFor({ state: "visible", timeout: 30000 });
    });

    test("F2 opens the active cell for editing without a mouse", async ({ page }) => {
        const titleCell = page.getByTestId("yjs-table-grid").locator("tbody tr").first().locator(
            "td[data-col='title']",
        );
        await titleCell.locator("button").click();
        await page.keyboard.press("Escape");
        await titleCell.locator("button").focus();
        await page.keyboard.press("F2");
        await expect(titleCell.locator("input")).toBeVisible();
        await expect(titleCell.locator("input")).toBeFocused();
    });

    test("typing a printable character replaces the cell content and starts editing", async ({ page }) => {
        const titleCell = page.getByTestId("yjs-table-grid").locator("tbody tr").first().locator(
            "td[data-col='title']",
        );
        await titleCell.locator("button").click();
        await page.keyboard.press("Escape");
        await titleCell.locator("button").focus();
        await page.keyboard.press("X");
        await expect(titleCell.locator("input")).toHaveValue("X");
    });

    test("Enter commits the edit and moves the active cell down", async ({ page }) => {
        const grid = page.getByTestId("yjs-table-grid");
        const firstRow = grid.locator("tbody tr").first();
        const titleCell = firstRow.locator("td[data-col='title']");
        // A click on the display button already opens the editor (see TextCell).
        await titleCell.locator("button").click();
        await expect(titleCell.locator("input")).toBeVisible();
        await titleCell.locator("input").fill("Renamed via keyboard");
        await page.keyboard.press("Enter");

        await expect(titleCell.locator("input")).not.toBeVisible();
        await expect(titleCell.locator("button")).toHaveText("Renamed via keyboard", { timeout: 30000 });
        const secondRow = grid.locator("tbody tr").nth(1);
        await expect(secondRow.locator("td[data-col='title']")).toHaveClass(/grid-active/);
    });

    test("Escape cancels an in-progress edit and Tab commits + moves right instead", async ({ page }) => {
        const grid = page.getByTestId("yjs-table-grid");
        const firstRow = grid.locator("tbody tr").first();
        const titleCell = firstRow.locator("td[data-col='title']");
        const originalTitle = (await titleCell.locator("button").textContent())?.trim() ?? "";

        await titleCell.locator("button").click();
        await expect(titleCell.locator("input")).toBeVisible();
        await titleCell.locator("input").fill("Discarded edit");
        await page.waitForTimeout(100);
        await page.keyboard.press("Escape");
        await expect(titleCell.locator("input")).not.toBeVisible();
        // Wait for rendering to catch up before asserting and clicking again
        await expect(titleCell.locator("button")).toHaveText(originalTitle, { timeout: 30000 });
        // Give UI time to stabilize
        await page.waitForTimeout(300);
        await titleCell.locator("button").click();

        await expect(titleCell.locator("input")).toBeVisible();
        await titleCell.locator("input").fill("Committed via Tab");
        // Give time for Svelte bindings to update before dispatching Tab
        await page.waitForTimeout(300);
        await page.keyboard.press("Tab");
        await expect(titleCell.locator("input")).not.toBeVisible({ timeout: 10000 });
        await expect(titleCell.locator("button")).toHaveText("Committed via Tab", { timeout: 30000 });
        await expect(firstRow.locator("td[data-col='cadence']")).toHaveClass(/grid-active/);
    });

    test("a focused select cell keeps native arrow-key behavior instead of navigating the grid", async ({ page }) => {
        const grid = page.getByTestId("yjs-table-grid");
        const cadenceCell = grid.locator("tbody tr").first().locator("td[data-col='cadence']");
        const select = cadenceCell.locator("select");
        await select.click();
        await expect(cadenceCell).toHaveClass(/grid-active/);

        await page.keyboard.press("ArrowDown");
        // Grid must not steal arrow keys from a focused native select, or move
        // the active cell away while the select still owns the keystroke.
        await expect(select).toBeFocused();
        await expect(cadenceCell).toHaveClass(/grid-active/);
    });
});
