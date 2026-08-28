import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
/** @feature FTR-8ac92ce2
 *  Title   : Expanded project Object Manager
 *  Source  : docs/client-features/obj-project-object-manager-8ac92ce2.yaml
 */
import { expect, test } from "@playwright/test";
import { createBlankGrid } from "../utils/crossProjectGridHelpers";
import { createBlockFromItem } from "../utils/nodeKindHelpers";
import { TestHelpers } from "../utils/testHelpers";

// Stays on the app's own client-side router throughout (sidebar links / back,
// never `page.goto()` mid-test) so the objects just created in this session
// are still the same in-memory Yjs docs Object Manager reads, not a fresh
// reconnect racing to resync.
async function openSidebar(page: import("@playwright/test").Page) {
    const showBtn = page.locator('button[aria-label="Show sidebar"]');
    if (await showBtn.isVisible().catch(() => false)) await showBtn.click();
    const sidebar = page.locator('aside.sidebar[aria-label="Main Sidebar"]');
    await expect(sidebar).toBeVisible({ timeout: 10000 });
    return sidebar;
}

test.describe("FTR-8ac92ce2: Object Manager lists Grid, Calendar, Table and Schedule", () => {
    test("shows all four object types and the type filter narrows the list", async ({ page }, testInfo) => {
        test.setTimeout(150000);
        await TestHelpers.seedProjectAndNavigate(page, testInfo, ["Item 1", "Item 2"]);

        // Calendar, via the slash command (visual node kinds are immutable, #5015).
        // Addressed by its own `data-item-id` (AGENTS.md: "Use data-item-id
        // selectors instead of nth()"), not render order.
        const secondItemId = await page.evaluate(() => {
            const items = (globalThis as unknown as {
                generalStore: { currentPage: { items: { at: (i: number) => { id: string; }; }; }; };
            }).generalStore.currentPage.items;
            return items.at(1).id;
        });
        const secondItem = page.locator(`[data-item-id="${secondItemId}"]`);
        await createBlockFromItem(page, secondItem, "Calendar");
        const calendarPanel = page.getByTestId("calendar-create-panel").first();
        await expect(calendarPanel).toBeVisible({ timeout: 10000 });
        await page.getByTestId("calendar-name-input").first().fill("List Test Calendar");
        await page.getByTestId("calendar-create").first().click();
        await expect(page.getByTestId("calendar-view").first()).toBeVisible({ timeout: 15000 });

        // A Table + its Grid host, via the toolbar.
        await createBlankGrid(page, "List Test Table", "list_test_table");

        // A Schedule, via the sidebar's "+" (no in-place name field yet — the
        // row is addressed by type, not by name, for this case).
        let sidebar = await openSidebar(page);
        await sidebar.locator('button[aria-label="Add new scheduled SQL"]').click();
        await expect(page).toHaveURL(/\/-\/schedules\/[^/]+$/, { timeout: 15000 });
        await page.goBack();

        // Object Manager.
        sidebar = await openSidebar(page);
        await sidebar.getByRole("link", { name: "Object Manager" }).click();
        await expect(page).toHaveURL(/\/objects$/, { timeout: 15000 });
        await expect(page.locator('[data-testid^="object-row-"]').first()).toBeVisible({ timeout: 15000 });

        const calendarRow = page.locator('[data-testid^="object-row-"]').filter({ hasText: "List Test Calendar" });
        const gridRow = page.locator('[data-testid^="object-row-"]').filter({ hasText: "List Test Table" }).filter({
            has: page.locator(".type-badge.grid"),
        });
        await expect(calendarRow).toBeVisible();
        await expect(gridRow).toBeVisible();
        await expect(calendarRow.locator(".type-badge")).toHaveText("Calendar");
        await expect(page.locator(".type-badge.schedule").first()).toBeVisible();
        await expect(page.locator(".type-badge.table").first()).toBeVisible();
        await expect(page.locator(".type-badge.grid").first()).toBeVisible();

        // Unchecking the Calendar filter hides it without hiding the rest.
        await page.getByLabel("Calendar", { exact: true }).uncheck();
        await expect(calendarRow).toBeHidden();
        await expect(gridRow).toBeVisible();

        await page.getByLabel("Calendar", { exact: true }).check();
        await expect(calendarRow).toBeVisible();
    });
});
