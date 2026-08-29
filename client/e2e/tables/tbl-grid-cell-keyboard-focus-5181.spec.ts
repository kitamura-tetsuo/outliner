import { expect, test } from "@playwright/test";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();

test.describe("Grid cell keyboard focus preservation (#5181)", () => {
    test("Enter commit and Escape cancel leave focus on the edited cell", async ({ page }) => {
        // Go directly to a standalone grid page in the demo project
        await page.goto("/demo/-/grids/demo-table-routine-occurrences-grid");

        const gridView = page.getByTestId("yjs-table-view");
        await expect(gridView).toBeVisible({ timeout: 30000 });

        const grid = gridView.getByTestId("yjs-table-grid");

        // Find the first row in the grid
        const tbody = grid.locator("tbody");
        const firstRow = tbody.locator("tr").first();
        await firstRow.waitFor({ state: "visible", timeout: 30000 });

        // Let's assume there is a 'title' or text column. We'll find the first editable text or number cell
        // routine occurrences has 'name' or 'title' column.
        const nameCell = firstRow.locator("td[data-col='title']");
        const nameButton = nameCell.locator("button");

        // Focus the button and press Enter to edit
        await nameButton.click();
        await expect(nameCell.locator("input")).toBeVisible();
        await expect(nameCell.locator("input")).toBeFocused();

        // Change value and press Enter
        // First, get the current value to append to it
        const currentVal = await nameCell.locator("input").inputValue();
        await nameCell.locator("input").fill(currentVal + " Updated");
        await nameCell.locator("input").press("Enter");

        // Input should disappear. Enter commits and moves the active cell down
        // (#5188, spreadsheet convention), so focus lands on the same column
        // in the row below -- never lost to the document.
        await expect(nameCell.locator("input")).not.toBeVisible();
        const belowNameButton = tbody.locator("tr").nth(1).locator("td[data-col='title']").locator("button");
        await expect(belowNameButton).toBeVisible({ timeout: 30000 }); // Wait for sync
        await expect(belowNameButton).toBeFocused();

        // Re-open the original cell with click
        await nameButton.click();
        await expect(nameCell.locator("input")).toBeVisible();
        await expect(nameCell.locator("input")).toBeFocused();

        // Press Escape to cancel
        await nameCell.locator("input").press("Escape");
        await expect(nameCell.locator("input")).not.toBeVisible();
        await expect(nameButton).toBeVisible({ timeout: 30000 });
        await expect(nameButton).toBeFocused();

        // Blur explicitly by clicking another row or the same row's other cell
        await nameButton.click(); // Edit mode again
        await expect(nameCell.locator("input")).toBeVisible();

        const otherCell = firstRow.locator("td[data-col='cadence']").locator("select, button, input").first();
        await otherCell.click();

        // Input should disappear because it blurred
        await expect(nameCell.locator("input")).not.toBeVisible();
        // Focus should be on the other cell, not stolen back
        await expect(otherCell).toBeFocused();
    });
});
