import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
/** @feature FTR-e3a9f2b1
 *  Title   : Gantt view
 *  Source  : docs/client-features/cal-gantt-view-e3a9f2b1.yaml
 */
import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

test.describe("FTR-e3a9f2b1: Gantt view", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        test.setTimeout(120000);
        await TestHelpers.seedProjectAndNavigate(page, testInfo, ["Calendar anchor", "Launch plan"]);
        await expect(page.locator(".outliner-item").first()).toBeVisible({ timeout: 10000 });

        // Give the second item a child with its own start+duration, so the
        // parent has a subtree to roll up from (docs/crdt-sql-architecture.md
        // §6.7): the parent itself carries only a `due`, and its Gantt bar
        // must come from the child instead.
        await page.evaluate(() => {
            const items = (globalThis as any).generalStore.currentPage.items;
            const today = new Date().toISOString().slice(0, 10);
            const parent = items.at(1);
            parent.due = `${today}T17:00:00.000Z`;
            const child = parent.items.addNode("tester");
            child.updateText("Design");
            child.start = today;
            child.allDay = true;
            child.duration = "P3D";
        });
        // Unlike a field-only mutation, adding a new outline item restructures
        // the tree and triggers a render of the new "Design" row. Wait for it
        // to settle before the first interaction so a right-click doesn't race
        // the outline's own reflow.
        await expect(page.getByText("Design", { exact: true })).toBeVisible({ timeout: 10000 });
    });

    test("renders a parent's rolled-up bar spanning its child, plus its own due marker", async ({ page }) => {
        const item = page.locator(".outliner-item").first();
        await item.click({ button: "right" });
        const contextMenu = page.locator(".context-menu");
        await expect(contextMenu).toBeVisible({ timeout: 10000 });
        await contextMenu.locator("button", { hasText: "Change to Calendar" }).click();

        const createPanel = page.getByTestId("calendar-create-panel").first();
        await expect(createPanel).toBeVisible({ timeout: 10000 });
        await page.getByTestId("calendar-name-input").first().fill("Gantt Calendar");
        await page.getByTestId("calendar-create").first().click();

        const view = page.getByTestId("calendar-view").first();
        await expect(view).toBeVisible({ timeout: 15000 });

        const queryInput = page.getByTestId("calendar-query-input").first();
        await queryInput.fill(
            "SELECT id, text AS title, due, all_day, start_at, start_on, duration, parent_id, "
                + "'outline_items' AS source_kind, id AS source_id FROM outline_items",
        );
        await queryInput.blur();
        await expect(page.getByTestId("calendar-read-only-banner")).toHaveCount(0, { timeout: 15000 });

        await page.getByTestId("calendar-role-roleTitle").first().selectOption("title");
        await page.getByTestId("calendar-role-roleStart").first().selectOption("start_at");
        await page.getByTestId("calendar-role-roleAllDay").first().selectOption("all_day");
        await page.getByTestId("calendar-role-roleDuration").first().selectOption("duration");
        await page.getByTestId("calendar-role-roleDue").first().selectOption("due");

        await page.getByTestId("calendar-view-type").first().selectOption("gantt");
        await expect(page.getByTestId("calendar-gantt-chart").first()).toBeVisible({ timeout: 15000 });

        // The parent row shows a rolled-up bar (from its child) and its own
        // due marker; the child renders as its own nested, indented row.
        const parentBar = page.locator('[data-testid^="calendar-gantt-bar-item:"]').first();
        await expect(parentBar).toBeVisible({ timeout: 15000 });
        await expect(parentBar).toHaveClass(/rollup/);
        const parentRow = page.locator('[data-testid^="calendar-gantt-row-item:"]').first();
        await expect(parentRow.locator('[data-testid^="calendar-gantt-milestone-item:"]')).toBeVisible();

        const childRow = page.locator('[data-testid^="calendar-gantt-row-item:"]').nth(1);
        await expect(childRow).toContainText("Design");

        // Collapsing the parent hides the child row but keeps the parent's own row.
        await page.locator('[data-testid^="calendar-gantt-collapse-item:"]').first().click();
        await expect(childRow).toHaveCount(0);
        await expect(parentRow).toBeVisible();
    });
});
