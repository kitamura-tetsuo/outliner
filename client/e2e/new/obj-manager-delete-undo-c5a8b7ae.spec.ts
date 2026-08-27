import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
/** @feature FTR-8ac92ce2
 *  Title   : Object Manager Delete removes placements and undoes as one step
 *  Source  : docs/client-features/obj-project-object-manager-8ac92ce2.yaml
 */
import { expect, test } from "@playwright/test";
import { createBlankGrid } from "../utils/crossProjectGridHelpers";
import { TestHelpers } from "../utils/testHelpers";

/**
 * Undo lives in an in-memory stack (services/undo/undoRouter.svelte.ts), so
 * this spec must reach `/objects` and back through the app's own
 * client-side router (a real link, then browser back) rather than
 * `page.goto()` — a full navigation would start a fresh page load with no
 * memory of the delete that just happened, and "Undo" would have nothing to
 * undo.
 */
async function openObjectManager(page: import("@playwright/test").Page) {
    const showBtn = page.locator('button[aria-label="Show sidebar"]');
    if (await showBtn.isVisible().catch(() => false)) await showBtn.click();
    const sidebar = page.locator('aside.sidebar[aria-label="Main Sidebar"]');
    await expect(sidebar).toBeVisible({ timeout: 10000 });
    await sidebar.getByRole("link", { name: "Object Manager" }).click();
    await expect(page).toHaveURL(/\/objects$/, { timeout: 15000 });
}

// `createBlankGrid` names the Table and its Grid host identically; this spec
// deletes only the Grid, so every lookup is scoped to the Grid badge — the
// Table row keeps showing "Delete Me" throughout and is not part of this test.
function gridRow(page: import("@playwright/test").Page) {
    return page.locator('[data-testid^="object-row-"]').filter({ hasText: "Delete Me" }).filter({
        has: page.locator(".type-badge.grid"),
    });
}

test.describe("FTR-8ac92ce2: Object Manager Delete and Undo", () => {
    test("deleting a Grid removes its placement; Undo restores both", async ({ page }, testInfo) => {
        test.setTimeout(120000);
        await TestHelpers.seedProjectAndNavigate(page, testInfo, ["Item 1"]);
        await createBlankGrid(page, "Delete Me", "delete_me");
        await expect(page.getByTestId("yjs-table-view").first()).toBeVisible({ timeout: 15000 });

        await openObjectManager(page);
        const row = gridRow(page);
        await expect(row).toBeVisible({ timeout: 15000 });

        await row.locator('[data-testid^="object-delete-"]').click();
        const dialog = page.getByRole("alertdialog", { name: 'Delete Grid "Delete Me"?' });
        await expect(dialog).toBeVisible();
        await dialog.getByRole("button", { name: "Delete" }).click();
        await expect(dialog).not.toBeVisible();

        // The Grid and its Page placement are both gone from Object Manager.
        await expect(gridRow(page)).toHaveCount(0);

        // Back on the Page (client-side history, not a reload): no empty shell left behind.
        await page.goBack();
        await expect(page.locator("[data-visual-node-root]")).toHaveCount(0, { timeout: 15000 });

        // Undo restores the Grid and its placement as one step.
        await page.getByTestId("toolbar-undo").click();
        await expect(page.locator("[data-visual-node-root]")).toHaveCount(1, { timeout: 15000 });
        await expect(page.getByTestId("yjs-table-view").first()).toBeVisible({ timeout: 15000 });

        await openObjectManager(page);
        await expect(gridRow(page)).toBeVisible({ timeout: 15000 });
    });
});
