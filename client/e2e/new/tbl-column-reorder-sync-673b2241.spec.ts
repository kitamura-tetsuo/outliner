import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
/** @feature TBL-673b2241
 *  Title   : Table column reordering
 *  Source  : docs/client-features/tbl-column-reorder-673b2241.yaml
 *
 *  Validates that column reordering synchronizes correctly to a second
 *  browser context connected to the same project.
 */
import { expect, test } from "@playwright/test";
import {
    createTasksTableBlock,
    dragColumnHeader,
    gridHeaderOrder,
    TASKS_PRESET_COLUMNS,
    waitForGridColumns,
} from "../utils/tableColumnDragHelpers";
import { TestHelpers } from "../utils/testHelpers";

test.describe("TBL-673b2241: cross-client synchronization of column reorder", () => {
    test("a column reorder syncs to a second client immediately", async ({ browser }, testInfo) => {
        test.setTimeout(120000);
        const context1 = await browser.newContext();
        const page1 = await context1.newPage();

        await TestHelpers.seedProjectAndNavigate(page1, testInfo, ["Table host item"]);
        await TestHelpers.waitForOutlinerItems(page1, 2, 10000);
        const hostItemId = await TestHelpers.getItemIdByIndex(page1, 1);

        await createTasksTableBlock(page1, hostItemId);
        expect(await gridHeaderOrder(page1)).toEqual(TASKS_PRESET_COLUMNS);

        // Connect second client to the same project and page
        const context2 = await browser.newContext();
        const page2 = await context2.newPage();
        const url = page1.url();
        await page2.goto(url);

        // Wait for table to load on client 2
        await waitForGridColumns(page2);
        expect(await gridHeaderOrder(page2)).toEqual(TASKS_PRESET_COLUMNS);

        // Reorder on client 1
        // Drop "status" on the left half of "title" so it lands before it.
        await dragColumnHeader(page1, "status", "title", "left");

        const reordered = ["id", "status", "title", "priority", "due_date", "repeat_days"];

        // Verify on client 1
        await expect.poll(() => gridHeaderOrder(page1), { timeout: 15000 }).toEqual(reordered);

        // Verify sync on client 2
        await expect.poll(() => gridHeaderOrder(page2), { timeout: 15000 }).toEqual(reordered);

        await context1.close();
        await context2.close();
    });
});
