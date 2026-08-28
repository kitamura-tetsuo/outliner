import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
/** @feature DUP-6799a6e2
 *  Title   : Object Manager "Duplicate selected" across projects, and Undo removes the whole operation
 *  Source  : docs/client-features/dup-duplicate-selected-object-manager-6799a6e2.yaml
 */
import { expect, test } from "@playwright/test";
import { createBlankGrid, seedCrossProjectFixture } from "../utils/crossProjectGridHelpers";

async function openObjectManager(page: import("@playwright/test").Page) {
    const showBtn = page.locator('button[aria-label="Show sidebar"]');
    if (await showBtn.isVisible().catch(() => false)) await showBtn.click();
    const sidebar = page.locator('aside.sidebar[aria-label="Main Sidebar"]');
    await expect(sidebar).toBeVisible({ timeout: 10000 });
    await sidebar.getByRole("link", { name: "Object Manager" }).click();
    await expect(page).toHaveURL(/\/objects$/, { timeout: 15000 });
}

function rowByNameAndType(page: import("@playwright/test").Page, name: string, typeClass: string) {
    return page.locator('[data-testid^="object-row-"]').filter({ hasText: name }).filter({
        has: page.locator(`.type-badge.${typeClass}`),
    });
}

test.describe("DUP-6799a6e2: Duplicate selected across projects and Undo", () => {
    test(
        "duplicates the selected Grid+Table into another project once, with the reference rewritten; Undo removes both",
        async ({ page }, testInfo) => {
            test.setTimeout(180000);
            const fixture = await seedCrossProjectFixture(page, testInfo);
            await createBlankGrid(page, "Board", "board");

            await openObjectManager(page);
            const gridRow = rowByNameAndType(page, "Board", "grid");
            const tableRow = rowByNameAndType(page, "Board", "table");
            await expect(gridRow).toBeVisible({ timeout: 15000 });
            await gridRow.locator('td.checkbox-col input[type="checkbox"]').check();
            await tableRow.locator('td.checkbox-col input[type="checkbox"]').check();
            await expect(page.getByTestId("object-manager-selected-count")).toHaveText("2 selected");

            await page.getByTestId("object-manager-duplicate-selected").click();
            const dialog = page.getByTestId("object-manager-duplicate-dialog");
            await expect(dialog).toBeVisible();
            await dialog.getByTestId("object-manager-duplicate-destination-project").fill(fixture.destinationProject);
            await expect(dialog.getByTestId("object-manager-duplicate-preview-count")).toContainText(
                `Destination: ${fixture.destinationProject}`,
            );
            await dialog.getByTestId("object-manager-duplicate-apply").click();

            // A cross-project Apply navigates (client-side) to the destination
            // project's Object Manager with the two copies preselected.
            await expect(page).toHaveURL(
                new RegExp(`/${encodeURIComponent(fixture.destinationProject)}/-/objects\\?selected=`),
                { timeout: 20000 },
            );
            const copiedGridRow = rowByNameAndType(page, "Board copy", "grid");
            const copiedTableRow = rowByNameAndType(page, "Board copy", "table");
            await expect(copiedGridRow).toBeVisible({ timeout: 15000 });
            await expect(copiedTableRow).toBeVisible();
            await expect(copiedGridRow.locator('td.checkbox-col input[type="checkbox"]')).toBeChecked();

            // Selected-to-selected reference rewrite: the copied Grid points at the
            // copied Table, not the source project's original.
            const { copiedGridSourceId, copiedTableId } = await page.evaluate(() => {
                // eslint-disable-next-line no-restricted-globals
                const client = (window as any).__YJS_STORE__?.yjsClient;
                const project = client?.getProject();
                let sourceId: string | undefined;
                project?.ydoc.getMap("yjsGrids").forEach((entry: any) => {
                    if (entry.get("name") === "Board copy") sourceId = entry.get("sourceTableId");
                });
                let tableId: string | undefined;
                project?.ydoc.getMap("yjsTables").forEach((entry: any, key: string) => {
                    if (entry.get("name") === "Board copy") tableId = key;
                });
                return { copiedGridSourceId: sourceId, copiedTableId: tableId };
            });
            expect(copiedGridSourceId).toBeTruthy();
            expect(copiedGridSourceId).toBe(copiedTableId);

            // One Undo removes the whole cross-project operation.
            await page.getByTestId("toolbar-undo").click();
            await expect(rowByNameAndType(page, "Board copy", "grid")).toHaveCount(0, { timeout: 15000 });
            await expect(rowByNameAndType(page, "Board copy", "table")).toHaveCount(0);
        },
    );
});
