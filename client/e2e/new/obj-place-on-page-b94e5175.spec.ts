import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
/** @feature FTR-b94e5175
 *  Title   : Place visual objects on Pages from Object Manager
 *  Source  : docs/client-features/obj-place-objects-on-pages-b94e5175.yaml
 */
import { expect, test } from "../fixtures/grid-render-trace";
import { createBlankGrid } from "../utils/crossProjectGridHelpers";
import { TestHelpers } from "../utils/testHelpers";

async function openObjectManager(page: import("@playwright/test").Page) {
    const show = page.locator('button[aria-label="Show sidebar"]');
    if (await show.isVisible().catch(() => false)) await show.click();
    const sidebar = page.locator('aside[aria-label="Main Sidebar"]');
    await expect(sidebar).toBeVisible();
    await sidebar.getByRole("link", { name: "Object Manager" }).click();
    await expect(page).toHaveURL(/\/objects$/);
    return sidebar;
}

function gridRow(page: import("@playwright/test").Page) {
    return page.locator('[data-testid^="object-row-"]').filter({ hasText: "Placeable" }).filter({
        has: page.locator(".type-badge.grid"),
    });
}

test.describe("FTR-b94e5175: Object Manager Page placement", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        await TestHelpers.seedProjectAndNavigate(page, testInfo, ["Page item"]);
        await createBlankGrid(page, "Placeable", "placeable");
        await expect(page.getByTestId("yjs-table-view")).toBeVisible();
    });

    test("places an existing Grid with the Page picker", async ({ page }) => {
        await openObjectManager(page);
        const row = gridRow(page);
        await row.locator('[data-testid^="object-place-"]').click();
        await page.getByTestId("object-placement-confirm").click();
        await expect(row.locator('[data-testid^="object-placement-"]')).toHaveCount(2);
    });

    test("drops a distinct object-placement payload on a sidebar Page", async ({ page }) => {
        const sidebar = await openObjectManager(page);
        const row = gridRow(page);
        const target = sidebar.locator("[data-page-id]").first();
        await row.evaluate((source) => {
            const transfer = new DataTransfer();
            source.dispatchEvent(
                new DragEvent("dragstart", { bubbles: true, cancelable: true, dataTransfer: transfer }),
            );
            const target = document.querySelector<HTMLElement>("aside [data-page-id]");
            target?.dispatchEvent(
                new DragEvent("dragover", { bubbles: true, cancelable: true, dataTransfer: transfer }),
            );
            target?.dispatchEvent(new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer: transfer }));
            source.dispatchEvent(new DragEvent("dragend", { bubbles: true, cancelable: true, dataTransfer: transfer }));
        });
        await expect(target).not.toHaveClass(/object-drop-target/);
        await expect(row.locator('[data-testid^="object-placement-"]')).toHaveCount(2);
    });
});
