/** @feature TBL-b4e82a91 */
import { expect, test } from "../fixtures/grid-render-trace";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
import { SqlEditorHelper } from "../utils/sqlEditorHelpers";
import { createTasksTableBlock } from "../utils/tableColumnDragHelpers";
import { TestHelpers } from "../utils/testHelpers";

registerCoverageHooks();

async function createTasksTable(page: import("@playwright/test").Page, testInfo: import("@playwright/test").TestInfo) {
    await TestHelpers.seedProjectAndNavigate(page, testInfo, ["Table visibility"]);
    await TestHelpers.waitForOutlinerItems(page, 2, 10000);
    await createTasksTableBlock(page, await TestHelpers.getItemIdByIndex(page, 1));

    const view = page.getByTestId("yjs-table-view").first();
    await expect(view.locator("th[data-col='priority']")).toBeVisible({ timeout: 30000 });
    return view;
}

test.describe("Table column visibility", () => {
    test("hides, persists, and restores a column in its original position", async ({ page }, testInfo) => {
        let view = await createTasksTable(page, testInfo);
        const originalColumns = await view.locator("th[data-col]").evaluateAll(headers =>
            headers.map(header => header.getAttribute("data-col"))
        );
        expect(originalColumns).toContain("priority");

        await view.getByTestId("yjs-table-toggle-ui").click();
        const shownCheckbox = view.getByTestId("yjs-table-hidden-priority");
        await expect(shownCheckbox).toHaveAccessibleName("Shown");
        await expect(shownCheckbox).toBeChecked();
        await shownCheckbox.uncheck();
        await expect(view.locator("th[data-col='priority']")).toHaveCount(0);
        await expect(view.locator("td[data-col='priority']")).toHaveCount(0);

        await page.reload();
        view = page.getByTestId("yjs-table-view").first();
        await expect(view).toBeVisible();
        await expect(view.locator("th[data-col='priority']")).toHaveCount(0);
        await view.getByTestId("yjs-table-toggle-ui").click();
        const persistedCheckbox = view.getByTestId("yjs-table-hidden-priority");
        await expect(persistedCheckbox).not.toBeChecked();

        await persistedCheckbox.check();
        await expect(view.locator("th[data-col='priority']")).toBeVisible();
        const restoredColumns = await view.locator("th[data-col]").evaluateAll(headers =>
            headers.map(header => header.getAttribute("data-col"))
        );
        expect(restoredColumns).toEqual(originalColumns);

        await page.reload();
        view = page.getByTestId("yjs-table-view").first();
        await expect(view.locator("th[data-col='priority']")).toBeVisible();
        const reloadedColumns = await view.locator("th[data-col]").evaluateAll(headers =>
            headers.map(header => header.getAttribute("data-col"))
        );
        expect(reloadedColumns).toEqual(originalColumns);
    });

    test("offers and persists visibility for a computed query column", async ({ page }, testInfo) => {
        let view = await createTasksTable(page, testInfo);
        await view.getByTestId("yjs-table-toggle-ui").click();
        const query = new SqlEditorHelper(view.getByTestId("yjs-table-query-input"));
        await query.fillAndCommit(page, "SELECT id, title, priority || ' task' AS summary FROM tasks ORDER BY id");

        const summaryHeader = view.locator("th[data-col='summary']");
        await expect(summaryHeader).toBeVisible({ timeout: 15000 });
        const shownCheckbox = view.getByTestId("yjs-table-hidden-summary");
        await expect(shownCheckbox).toHaveAccessibleName("Shown");
        await expect(shownCheckbox).toBeChecked();
        await shownCheckbox.uncheck();
        await expect(summaryHeader).toHaveCount(0);
        await expect(view.locator("td[data-col='summary']")).toHaveCount(0);

        await page.reload();
        view = page.getByTestId("yjs-table-view").first();
        await expect(view).toBeVisible();
        await expect(view.locator("th[data-col='summary']")).toHaveCount(0);
        await view.getByTestId("yjs-table-toggle-ui").click();
        const persistedCheckbox = view.getByTestId("yjs-table-hidden-summary");
        await expect(persistedCheckbox).not.toBeChecked();
        await persistedCheckbox.check();
        await expect(view.locator("th[data-col='summary']")).toBeVisible();
    });
});
