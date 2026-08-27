import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
/** @feature FTR-8ac92ce2
 *  Title   : Object Manager dependency-aware Select related, including Calendar
 *  Source  : docs/client-features/obj-project-object-manager-8ac92ce2.yaml
 */
import { expect, test } from "@playwright/test";
import { createBlankGrid } from "../utils/crossProjectGridHelpers";
import { createBlockFromItem } from "../utils/nodeKindHelpers";
import { TestHelpers } from "../utils/testHelpers";

async function openSidebar(page: import("@playwright/test").Page) {
    const showBtn = page.locator('button[aria-label="Show sidebar"]');
    if (await showBtn.isVisible().catch(() => false)) await showBtn.click();
    const sidebar = page.locator('aside.sidebar[aria-label="Main Sidebar"]');
    await expect(sidebar).toBeVisible({ timeout: 10000 });
    return sidebar;
}

function rowByNameAndType(page: import("@playwright/test").Page, name: string, typeClass: string) {
    return page.locator('[data-testid^="object-row-"]').filter({ hasText: name }).filter({
        has: page.locator(`.type-badge.${typeClass}`),
    });
}

test.describe("FTR-8ac92ce2: Select related traverses the shared dependency graph", () => {
    test("Dependencies then All connected reach a Table's Grid and Calendar", async ({ page }, testInfo) => {
        test.setTimeout(180000);
        await TestHelpers.seedProjectAndNavigate(page, testInfo, ["Item 1"]);
        await createBlankGrid(page, "Related Board", "related_board");

        // A Calendar whose query reads the same Table (issue #5135 §4).
        const item = page.locator(".outliner-item[data-item-id]").first();
        const block = await createBlockFromItem(page, item, "Calendar");
        const createPanel = block.getByTestId("calendar-create-panel");
        await expect(createPanel).toBeVisible({ timeout: 10000 });
        await createPanel.getByTestId("calendar-name-input").fill("Related Calendar");
        await createPanel.getByTestId("calendar-create").click();
        const view = block.getByTestId("calendar-view");
        await expect(view).toBeVisible({ timeout: 20000 });
        const queryInput = view.getByTestId("calendar-query-input");
        await queryInput.fill("SELECT id, title FROM related_board");
        await queryInput.blur();
        // The query need not be draggable/editable (that needs source_kind +
        // source_id, unrelated to this spec) — it only needs to execute
        // without a SQL error so the dependency edge it creates is real.
        await expect(view.getByTestId("calendar-query-error")).toHaveCount(0, { timeout: 20000 });

        const sidebar = await openSidebar(page);
        await sidebar.getByRole("link", { name: "Object Manager" }).click();
        await expect(page).toHaveURL(/\/objects$/, { timeout: 15000 });

        const gridRow = rowByNameAndType(page, "Related Board", "grid");
        const tableRow = rowByNameAndType(page, "Related Board", "table");
        const calendarRow = rowByNameAndType(page, "Related Calendar", "calendar");
        await expect(gridRow).toBeVisible({ timeout: 15000 });
        await expect(tableRow).toBeVisible();
        await expect(calendarRow).toBeVisible();

        // Dependencies from the Grid selects the Table it references, and only that.
        await gridRow.locator('td.checkbox-col input[type="checkbox"]').check();
        await page.getByTestId("object-manager-select-related").click();
        await page.getByTestId("object-manager-select-related-dependencies").click();
        await expect(tableRow.locator('td.checkbox-col input[type="checkbox"]')).toBeChecked();
        await expect(calendarRow.locator('td.checkbox-col input[type="checkbox"]')).not.toBeChecked();
        await expect(page.getByTestId("object-manager-selected-count")).toHaveText("2 selected");

        // Filtering the Table out of view keeps it selected — the count does
        // not drop just because a selected row is hidden.
        await page.getByLabel("Table", { exact: true }).uncheck();
        await expect(tableRow).toBeHidden();
        await expect(page.getByTestId("object-manager-selected-count")).toHaveText("2 selected");
        await page.getByLabel("Table", { exact: true }).check();

        // All connected, from the still-selected Grid+Table (additive — nothing
        // already selected is cleared), additionally reaches the Calendar.
        await page.getByTestId("object-manager-select-related").click();
        await page.getByTestId("object-manager-select-related-connected").click();
        await expect(calendarRow.locator('td.checkbox-col input[type="checkbox"]')).toBeChecked();
        await expect(gridRow.locator('td.checkbox-col input[type="checkbox"]')).toBeChecked();
        await expect(tableRow.locator('td.checkbox-col input[type="checkbox"]')).toBeChecked();
        await expect(page.getByTestId("object-manager-selected-count")).toHaveText("3 selected");
    });
});
