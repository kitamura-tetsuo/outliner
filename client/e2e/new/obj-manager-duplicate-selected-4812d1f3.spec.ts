import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
/** @feature DUP-6799a6e2
 *  Title   : Object Manager "Duplicate selected" — preselection, Select related, hidden-selection preview
 *  Source  : docs/client-features/dup-duplicate-selected-object-manager-6799a6e2.yaml
 */
import { expect, test } from "@playwright/test";
import { createBlankGrid } from "../utils/crossProjectGridHelpers";
import { createBlockFromItem } from "../utils/nodeKindHelpers";
import { TestHelpers } from "../utils/testHelpers";

function rowByNameAndType(page: import("@playwright/test").Page, name: string, typeClass: string) {
    return page.locator('[data-testid^="object-row-"]').filter({ hasText: name }).filter({
        has: page.locator(`.type-badge.${typeClass}`),
    });
}

test.describe("DUP-6799a6e2: individual Grid Duplicate opens Object Manager preselected", () => {
    test(
        "Select related then Duplicate selected copies the full visible+hidden selection",
        async ({ page }, testInfo) => {
            test.setTimeout(180000);
            await TestHelpers.seedProjectAndNavigate(page, testInfo, ["Item 1"]);
            await createBlankGrid(page, "Board", "board");

            const item = page.locator(".outliner-item[data-item-id]").first();
            const block = await createBlockFromItem(page, item, "Calendar");
            const createPanel = block.getByTestId("calendar-create-panel");
            await expect(createPanel).toBeVisible({ timeout: 10000 });
            await createPanel.getByTestId("calendar-name-input").fill("Board Calendar");
            await createPanel.getByTestId("calendar-create").click();
            const view = block.getByTestId("calendar-view");
            await expect(view).toBeVisible({ timeout: 20000 });
            const queryInput = view.getByTestId("calendar-query-input");
            await queryInput.fill("SELECT id, title FROM board");
            await queryInput.blur();
            await expect(view.getByTestId("calendar-query-error")).toHaveCount(0, { timeout: 20000 });

            const projectName = decodeURIComponent(new URL(page.url()).pathname.split("/")[1]);
            const gridId = await page.evaluate(() => {
                // eslint-disable-next-line no-restricted-globals
                const client = (window as any).__YJS_STORE__?.yjsClient;
                const project = client?.getProject();
                let gid: string | undefined;
                project?.ydoc.getMap("yjsGrids").forEach((_val: any, key: string) => {
                    gid = key;
                });
                return gid;
            });

            // Step 1-3: open the Grid, press Duplicate, land in Object Manager preselected.
            await page.goto(`/${encodeURIComponent(projectName)}/-/grids/${gridId}`);
            await page.getByTestId("grid-duplicate-button").click();
            await expect(page).toHaveURL(new RegExp(`/objects\\?selected=${gridId}$`), { timeout: 15000 });
            const gridRow = rowByNameAndType(page, "Board", "grid");
            await expect(gridRow.locator('td.checkbox-col input[type="checkbox"]')).toBeChecked();
            await expect(page.getByTestId("object-manager-selected-count")).toHaveText("1 selected");

            // Step 4-5: Select related -> All connected reaches the Table and Calendar.
            await page.getByTestId("object-manager-select-related").click();
            await page.getByTestId("object-manager-select-related-connected").click();
            const tableRow = rowByNameAndType(page, "Board", "table");
            const calendarRow = rowByNameAndType(page, "Board Calendar", "calendar");
            await expect(tableRow.locator('td.checkbox-col input[type="checkbox"]')).toBeChecked();
            await expect(calendarRow.locator('td.checkbox-col input[type="checkbox"]')).toBeChecked();
            await expect(page.getByTestId("object-manager-selected-count")).toHaveText("3 selected");

            // Step 6: a type filter hides the Calendar without dropping it from the selection.
            await page.getByLabel("Calendar", { exact: true }).uncheck();
            await expect(calendarRow).toBeHidden();
            await expect(page.getByTestId("object-manager-hidden-selection-warning")).toHaveText(
                "1 selected object is hidden by the current filter.",
            );
            await expect(page.getByTestId("object-manager-selected-count")).toHaveText("3 selected");

            // Step 7-8: Duplicate selected previews the complete visible+hidden selection.
            await page.getByTestId("object-manager-duplicate-selected").click();
            const dialog = page.getByTestId("object-manager-duplicate-dialog");
            await expect(dialog).toBeVisible();
            await expect(dialog.getByTestId("object-manager-duplicate-preview-count")).toContainText(
                "3 objects will be duplicated",
            );
            await expect(dialog.getByTestId("object-manager-duplicate-hidden-warning")).toContainText(
                "1 selected object is hidden",
            );
            // No second dependency-scope chooser is offered here.
            await expect(dialog.locator("select")).toHaveCount(0);

            await dialog.getByTestId("object-manager-duplicate-apply").click();
            await expect(dialog).toBeHidden({ timeout: 20000 });

            await expect(rowByNameAndType(page, "Board", "grid")).toHaveCount(2);
            await expect(rowByNameAndType(page, "Board", "table")).toHaveCount(2);
            await page.getByLabel("Calendar", { exact: true }).check();
            await expect(rowByNameAndType(page, "Board Calendar", "calendar")).toHaveCount(2);

            // The copied Grid's source-table reference was rewritten to the copied Table.
            const { copiedGridSourceId, copiedTableIds } = await page.evaluate(() => {
                // eslint-disable-next-line no-restricted-globals
                const client = (window as any).__YJS_STORE__?.yjsClient;
                const project = client?.getProject();
                const grids: { name: string; sourceTableId: string; }[] = [];
                project?.ydoc.getMap("yjsGrids").forEach((entry: any) => {
                    grids.push({ name: entry.get("name"), sourceTableId: entry.get("sourceTableId") });
                });
                const tables: string[] = [];
                project?.ydoc.getMap("yjsTables").forEach((_val: any, key: string) => tables.push(key));
                const copy = grids.find(g => g.name === "Board copy");
                return { copiedGridSourceId: copy?.sourceTableId, copiedTableIds: tables };
            });
            expect(copiedGridSourceId).toBeTruthy();
            expect(copiedTableIds).toContain(copiedGridSourceId);
        },
    );
});
