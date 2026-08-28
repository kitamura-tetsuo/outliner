import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
/** @feature DUP-6799a6e2
 *  Title   : Cross-project Table row duplication persists after reload
 *  Source  : docs/client-features/dup-duplicate-selected-object-manager-6799a6e2.yaml
 */
import { expect, test } from "@playwright/test";
import { addSourceRecord, createBlankGrid, seedCrossProjectFixture } from "../utils/crossProjectGridHelpers";

async function openObjectManager(page: import("@playwright/test").Page) {
    const showBtn = page.locator('button[aria-label="Show sidebar"]');
    if (await showBtn.isVisible().catch(() => false)) await showBtn.click();
    const sidebar = page.locator('aside.sidebar[aria-label="Main Sidebar"]');
    await expect(sidebar).toBeVisible({ timeout: 10000 });
    await sidebar.getByRole("link", { name: "Object Manager" }).click();
    await expect(page).toHaveURL(/\/objects$/, { timeout: 15000 });
}

function tableRow(page: import("@playwright/test").Page, name: string) {
    return page.locator('[data-testid^="object-row-"]').filter({ hasText: name }).filter({
        has: page.locator(".type-badge.table"),
    });
}

test("copies Table rows to another project and reloads them from its Table room", async ({ page }, testInfo) => {
    test.setTimeout(180000);
    const fixture = await seedCrossProjectFixture(page, testInfo);
    await createBlankGrid(page, "Board", "board");
    await addSourceRecord(page);

    await openObjectManager(page);
    const sourceTable = tableRow(page, "Board");
    await expect(sourceTable).toBeVisible({ timeout: 15000 });
    await sourceTable.locator('td.checkbox-col input[type="checkbox"]').check();
    await page.getByTestId("object-manager-duplicate-selected").click();

    const dialog = page.getByTestId("object-manager-duplicate-dialog");
    await dialog.getByTestId("object-manager-duplicate-copy-data").check();
    await dialog.getByTestId("object-manager-duplicate-destination-project").fill(fixture.destinationProject);
    await dialog.getByTestId("object-manager-duplicate-apply").click();
    await expect(page).toHaveURL(
        new RegExp(`/${encodeURIComponent(fixture.destinationProject)}/-/objects\\?selected=`),
        { timeout: 30000 },
    );
    await expect(tableRow(page, "Board copy")).toBeVisible({ timeout: 15000 });

    const showBtn = page.locator('button[aria-label="Show sidebar"]');
    if (await showBtn.isVisible().catch(() => false)) await showBtn.click();
    const sidebar = page.locator('aside.sidebar[aria-label="Main Sidebar"]');
    await expect(sidebar).toBeVisible({ timeout: 10000 });
    await sidebar.getByRole("link", { name: "Tables" }).click();
    await page.getByRole("link", { name: "Board copy" }).click();

    // Reload the Table route itself so both the project document and Table
    // subdoc are reconstructed through their normal synchronization paths.
    // The management route is intentionally reached through Svelte-managed
    // navigation and is not a standalone hard-reload bootstrap route.
    await page.reload();
    const copiedView = page.getByTestId("yjs-table-view");
    await expect(copiedView).toBeVisible({ timeout: 30000 });
    await expect(copiedView.getByTestId("yjs-table-grid").locator("tbody tr")).toHaveCount(1, { timeout: 30000 });
});
