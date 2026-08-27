import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
/** @feature FTR-8ac92ce2
 *  Title   : Object Manager bulk literal Find/Replace
 *  Source  : docs/client-features/obj-project-object-manager-8ac92ce2.yaml
 */
import { expect, test } from "@playwright/test";
import { createBlankGrid } from "../utils/crossProjectGridHelpers";
import { TestHelpers } from "../utils/testHelpers";

async function openSidebar(page: import("@playwright/test").Page) {
    const showBtn = page.locator('button[aria-label="Show sidebar"]');
    if (await showBtn.isVisible().catch(() => false)) await showBtn.click();
    const sidebar = page.locator('aside.sidebar[aria-label="Main Sidebar"]');
    await expect(sidebar).toBeVisible({ timeout: 10000 });
    return sidebar;
}

// `createBlankGrid` names the Table and its Grid host identically, so every
// row lookup here is scoped to the Grid badge — the object this spec
// actually selects and renames.
function gridRow(page: import("@playwright/test").Page, name: string) {
    return page.locator('[data-testid^="object-row-"]').filter({ hasText: name }).filter({
        has: page.locator(".type-badge.grid"),
    });
}

test.describe("FTR-8ac92ce2: bulk literal Find/Replace is visible and previews before applying", () => {
    test("selecting objects reveals the bulk panel with a before/after preview", async ({ page }, testInfo) => {
        test.setTimeout(150000);
        await TestHelpers.seedProjectAndNavigate(page, testInfo, ["Item 1"]);
        await createBlankGrid(page, "Demo Alpha", "demo_alpha");
        await createBlankGrid(page, "Demo Beta", "demo_beta");

        const sidebar = await openSidebar(page);
        await sidebar.getByRole("link", { name: "Object Manager" }).click();
        await expect(page).toHaveURL(/\/objects$/, { timeout: 15000 });

        const alphaRow = gridRow(page, "Demo Alpha");
        const betaRow = gridRow(page, "Demo Beta");
        await expect(alphaRow).toBeVisible({ timeout: 15000 });
        await expect(betaRow).toBeVisible();

        // Discoverable without selecting anything: a standing hint and the
        // compact bulk toolbar are always shown, before any selection exists.
        await expect(page.locator(".bulk-hint")).toBeVisible();
        const toolbar = page.getByTestId("object-manager-bulk-toolbar");
        await expect(toolbar).toBeVisible();
        await expect(page.getByTestId("object-manager-selected-count")).toHaveText("0 selected");
        await expect(page.getByTestId("object-manager-bulk-find")).toBeDisabled();

        await alphaRow.locator('td.checkbox-col input[type="checkbox"]').check();
        await betaRow.locator('td.checkbox-col input[type="checkbox"]').check();

        // Selecting rows never toggles the toolbar's presence — only which
        // controls are enabled (issue #5135 §1).
        await expect(toolbar).toBeVisible();
        await expect(page.getByTestId("object-manager-selected-count")).toHaveText("2 selected");
        await expect(page.getByTestId("object-manager-bulk-find")).toBeEnabled();

        await page.getByTestId("object-manager-bulk-find").fill("Demo");
        await page.getByTestId("object-manager-bulk-replace").fill("Test");

        // The preview is a popover, opened explicitly rather than expanding
        // inline below the toolbar.
        await page.getByTestId("object-manager-bulk-preview-open").click();
        const preview = page.getByTestId("object-manager-bulk-preview");
        await expect(preview).toBeVisible();
        await expect(preview).toContainText("Demo Alpha");
        await expect(preview).toContainText("Test Alpha");
        await expect(preview).toContainText("Demo Beta");
        await expect(preview).toContainText("Test Beta");

        // The overlay covers the toolbar behind it, so Apply is applied from
        // the preview popover itself rather than the (currently obscured)
        // toolbar button.
        await page.getByTestId("object-manager-bulk-preview-apply").click();

        await expect(gridRow(page, "Test Alpha")).toBeVisible({ timeout: 10000 });
        await expect(gridRow(page, "Test Beta")).toBeVisible();
        await expect(gridRow(page, "Demo Alpha")).toHaveCount(0);
        await expect(gridRow(page, "Demo Beta")).toHaveCount(0);
    });

    test("select-all reflects only the currently visible rows, not a hidden selection", async ({ page }, testInfo) => {
        test.setTimeout(120000);
        await TestHelpers.seedProjectAndNavigate(page, testInfo, ["Item 1"]);
        await createBlankGrid(page, "Filter Sel Grid", "filter_sel_grid");

        const sidebar = await openSidebar(page);
        await sidebar.getByRole("link", { name: "Object Manager" }).click();
        await expect(page).toHaveURL(/\/objects$/, { timeout: 15000 });

        // Select the Grid row, then filter it out of view — the Table row
        // (same name, unselected) is now the only visible row.
        await gridRow(page, "Filter Sel Grid").locator('td.checkbox-col input[type="checkbox"]').check();
        await page.getByLabel("Grid", { exact: true }).uncheck();

        const tableRow = page.locator('[data-testid^="object-row-"]').filter({ hasText: "Filter Sel Grid" }).filter({
            has: page.locator(".type-badge.table"),
        });
        await expect(tableRow).toBeVisible();
        const headerCheckbox = page.locator('thead .checkbox-col input[type="checkbox"]');

        // Nothing visible is selected, so the header checkbox must not show checked.
        await expect(headerCheckbox).not.toBeChecked();

        // Activating it selects the visible Table, not clear the hidden Grid selection.
        await headerCheckbox.check();
        await expect(tableRow.locator('td.checkbox-col input[type="checkbox"]')).toBeChecked();

        await page.getByLabel("Grid", { exact: true }).check();
        await expect(gridRow(page, "Filter Sel Grid").locator('td.checkbox-col input[type="checkbox"]'))
            .toBeChecked();
    });
});
