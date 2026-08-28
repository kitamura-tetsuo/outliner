import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
/** @feature FTR-8ac92ce2
 *  Title   : Object Manager compact bulk toolbar keeps the object table position stable
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

test.describe("FTR-8ac92ce2: the compact bulk toolbar never shifts the object table", () => {
    test(
        "selecting rows and opening the preview popover keep the table's position fixed",
        async ({ page }, testInfo) => {
            test.setTimeout(150000);
            await TestHelpers.seedProjectAndNavigate(page, testInfo, ["Item 1"]);
            await createBlankGrid(page, "Stable Alpha", "stable_alpha");

            const sidebar = await openSidebar(page);
            await sidebar.getByRole("link", { name: "Object Manager" }).click();
            await expect(page).toHaveURL(/\/objects$/, { timeout: 15000 });

            const table = page.locator(".objects-table");
            await expect(table).toBeVisible({ timeout: 15000 });
            await expect(page.getByTestId("object-manager-bulk-toolbar")).toBeVisible();

            const positionBeforeSelection = await table.boundingBox();
            expect(positionBeforeSelection).not.toBeNull();

            const row = page.locator('[data-testid^="object-row-"]').filter({ hasText: "Stable Alpha" }).filter({
                has: page.locator(".type-badge.grid"),
            });
            await row.locator('td.checkbox-col input[type="checkbox"]').check();
            await expect(page.getByTestId("object-manager-selected-count")).toHaveText("1 selected");

            const positionAfterSelection = await table.boundingBox();
            expect(positionAfterSelection?.y).toBe(positionBeforeSelection?.y);

            await page.getByTestId("object-manager-bulk-find").fill("Stable");
            await page.getByTestId("object-manager-bulk-replace").fill("Renamed");
            await page.getByTestId("object-manager-bulk-preview-open").click();
            await expect(page.getByTestId("object-manager-bulk-preview")).toBeVisible();

            // The preview is a fixed-position popover: it must not reflow the page
            // underneath it while it is open.
            const positionWithPreviewOpen = await table.boundingBox();
            expect(positionWithPreviewOpen?.y).toBe(positionBeforeSelection?.y);

            // ... and closing it must not leave any lasting shift either.
            await page.keyboard.press("Escape").catch(() => {});
            await page.locator(".preview-overlay").click({ position: { x: 4, y: 4 } });
            await expect(page.getByTestId("object-manager-bulk-preview")).toBeHidden();
            const positionAfterClose = await table.boundingBox();
            expect(positionAfterClose?.y).toBe(positionBeforeSelection?.y);

            await row.locator('td.checkbox-col input[type="checkbox"]').uncheck();
            await expect(page.getByTestId("object-manager-selected-count")).toHaveText("0 selected");
            const positionAfterDeselect = await table.boundingBox();
            expect(positionAfterDeselect?.y).toBe(positionBeforeSelection?.y);
        },
    );
});
