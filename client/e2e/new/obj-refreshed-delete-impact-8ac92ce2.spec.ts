/** @feature FTR-8ac92ce2 */
import { expect, test } from "@playwright/test";
import { createBlankGrid, readGridProjectState } from "../utils/crossProjectGridHelpers";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
import { TestHelpers } from "../utils/testHelpers";
registerCoverageHooks();

for (const bulk of [false, true]) {
    test(
        `Object Manager ${bulk ? "bulk" : "single"} confirmation remains actionable after SQL impact changes`,
        async ({ page }, info) => {
            test.setTimeout(90000);
            await TestHelpers.seedProjectAndNavigate(page, info, ["Anchor", "Neighbour"]);
            await createBlankGrid(page, "Read A", "a");
            const before = await readGridProjectState(page);
            const table = before.tables[0];
            const grid = before.grids[0];
            const show = page.getByRole("button", { name: "Show sidebar" });
            if (await show.isVisible()) await show.click();
            await page.locator('aside[aria-label="Main Sidebar"]').getByRole("link", { name: "Object Manager" })
                .click();
            if (bulk) {
                await page.getByTestId(`object-row-${table.id}`).locator("td.checkbox-col input").check();
                await page.getByRole("button", { name: /Delete selected \(1\)/ }).click();
            } else await page.getByTestId(`object-delete-${table.id}`).click();
            const dialog = page.getByRole("alertdialog");
            await expect(dialog).toBeVisible();
            await page.evaluate(id => {
                const project = (globalThis as any).__YJS_STORE__.yjsClient.getProject();
                project.ydoc.transact(
                    () => project.ydoc.getMap("yjsGrids").get(id).set("query", "SELECT FROM"),
                    "peer",
                );
            }, grid.id);
            await dialog.getByRole("button", { name: "Delete", exact: true }).click();
            expect((await readGridProjectState(page)).tables.map(t => t.id)).toEqual([table.id]);
            await expect(dialog).toBeVisible();
            await expect(dialog).toContainText(/uncertain/);
            await dialog.getByRole("button", { name: "Delete", exact: true }).click();
            await expect(dialog).not.toBeVisible();
            const after = await readGridProjectState(page);
            expect(after.tables).toEqual([]);
            expect(after.placements).toEqual(before.placements);
            expect(after.grids.map(g => g.id)).toEqual([grid.id]);
            expect(after.grids[0].query).toBe("SELECT FROM");
        },
    );
}
