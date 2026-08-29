/** @feature FTR-1a2b3c4d */
import "../utils/registerAfterEachSnapshot";
import { expect, test } from "../fixtures/grid-render-trace";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";

registerCoverageHooks();

test.describe("Grid row deletion confirmation", () => {
    test("Grid row-delete confirmation works as expected", async ({ page }) => {
        // Use an existing demo grid directly
        await page.goto("/demo/-/grids/demo-table-routine-occurrences-history-grid");

        const gridView = page.getByTestId("yjs-table-view");
        await expect(gridView).toBeVisible({ timeout: 30000 });

        const addRowButton = gridView.getByTestId("yjs-table-add-row");
        await expect(addRowButton).toBeVisible({ timeout: 30000 });

        const grid = gridView.getByTestId("yjs-table-grid");
        const rows = grid.locator("tbody tr");

        await expect(rows).not.toHaveCount(0, { timeout: 30000 });
        const initialCount = await rows.count();

        // Check the Confirm before deleting rows toggle
        const uiToggleButton = gridView.getByTestId("yjs-table-toggle-ui");
        await uiToggleButton.click({ force: true });

        const uiEditor = gridView.getByTestId("yjs-table-ui-editor");
        await expect(uiEditor).toBeVisible({ timeout: 30000 });

        const toggleCheckbox = uiEditor.locator("label:has-text('Confirm before deleting rows') input");
        await toggleCheckbox.waitFor({ state: "attached" });

        // Wait for it to be stable
        await page.waitForTimeout(500);

        if (!(await toggleCheckbox.isChecked())) {
            await toggleCheckbox.check({ force: true });
        }

        await uiToggleButton.click({ force: true });
        await expect(uiEditor).not.toBeVisible();
        await page.waitForTimeout(500);

        // Add a row
        await addRowButton.click();
        await expect(async () => {
            expect(await rows.count()).toBeGreaterThan(initialCount);
        }).toPass({ timeout: 10000 });

        let currentCount = await rows.count();

        await page.waitForTimeout(500);

        // Try deleting the LAST row
        await page.evaluate(() => {
            const btns = document.querySelectorAll("button.delete-row");
            if (btns.length > 0) {
                btns[btns.length - 1].dispatchEvent(new MouseEvent("click", { bubbles: true }));
            }
        });

        // Dialog should appear
        const deleteConfirmDialog = page.locator("dialog"); // Use explicit locator instead of getByRole to avoid flakiness with alertdialog vs dialog roles
        await expect(deleteConfirmDialog).toBeVisible({ timeout: 10000 });

        // Cancelling the dialog leaves the row unchanged
        await deleteConfirmDialog.getByRole("button", { name: "Cancel" }).click();
        await expect(deleteConfirmDialog).not.toBeVisible();
        await expect(async () => {
            expect(await rows.count()).toBe(currentCount);
        }).toPass({ timeout: 10000 });

        // Confirming the dialog deletes the row
        await page.waitForTimeout(500);
        await page.evaluate(() => {
            const btns = document.querySelectorAll("button.delete-row");
            if (btns.length > 0) {
                btns[btns.length - 1].dispatchEvent(new MouseEvent("click", { bubbles: true }));
            }
        });
        await expect(deleteConfirmDialog).toBeVisible({ timeout: 10000 });
        await deleteConfirmDialog.getByRole("button", { name: "Delete" }).click();

        // Dialog should be gone
        await expect(deleteConfirmDialog).not.toBeVisible();
        await expect(async () => {
            expect(await rows.count()).toBeLessThan(currentCount);
        }).toPass({ timeout: 10000 });

        currentCount = await rows.count();

        // Now test without confirmation
        await uiToggleButton.click({ force: true });
        await expect(uiEditor).toBeVisible({ timeout: 30000 });

        await toggleCheckbox.uncheck({ force: true });
        await page.waitForTimeout(1000); // Wait for sync

        await uiToggleButton.click({ force: true });
        await expect(uiEditor).not.toBeVisible();
        await page.waitForTimeout(1000);

        // Add row again
        await addRowButton.click();
        await expect(async () => {
            expect(await rows.count()).toBeGreaterThan(currentCount);
        }).toPass({ timeout: 10000 });
        currentCount = await rows.count();

        await page.waitForTimeout(1000);

        // Try deleting another row (should not need confirmation)
        await page.evaluate(() => {
            const btns = document.querySelectorAll("button.delete-row");
            if (btns.length > 0) {
                btns[btns.length - 1].dispatchEvent(new MouseEvent("click", { bubbles: true }));
            }
        });

        // Wait for dialog not to be visible
        await expect(deleteConfirmDialog).not.toBeVisible();

        // Let it sync completely, then it decreases by 1
        await expect(async () => {
            expect(await rows.count()).toBeLessThan(currentCount);
        }).toPass({ timeout: 10000 });
    });
});
