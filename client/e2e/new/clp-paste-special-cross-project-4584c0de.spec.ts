/** @feature CLP-4584c0de */
import { expect, test } from "@playwright/test";
import {
    addSourceRecord,
    configureGrid,
    copyGridHosts,
    createBlankGrid,
    openPasteSpecialAtAnchor,
    openProjectPage,
    readGridProjectState,
    seedCrossProjectFixture,
} from "../utils/crossProjectGridHelpers";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();

const SCHEMA = "CREATE TABLE orders (\n  id TEXT PRIMARY KEY,\n  title TEXT NOT NULL,\n"
    + "  quantity INTEGER,\n  done BOOLEAN\n)";
const QUERY = "SELECT id, title, quantity, done FROM orders";

test.describe("Paste Special in another project", () => {
    test.beforeEach(async ({ page }) => {
        await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
    });

    test("explains the impossible view and applies the independent and values variants", async ({ page }, testInfo) => {
        test.setTimeout(180000);
        const fixture = await seedCrossProjectFixture(page, testInfo);
        await createBlankGrid(page, "Orders", "orders");
        await configureGrid(page, 0, SCHEMA, QUERY, "Order title");
        await addSourceRecord(page);
        await copyGridHosts(page);

        await openProjectPage(page, fixture, "destination");
        await createBlankGrid(page, "Warmup", "warmup_table");
        const warmupId = (await readGridProjectState(page)).tables[0].id;

        await openPasteSpecialAtAnchor(page);
        const anotherView = page.getByTestId("paste-special-another-view");
        await expect(anotherView).toBeDisabled();
        await expect(anotherView).toContainText("belongs to another project");
        await page.getByTestId("paste-special-copy-without-data").click();
        await expect(page.getByTestId("yjs-table-view")).toHaveCount(2, { timeout: 60000 });
        let state = await readGridProjectState(page);
        expect(state.tables.find(table => table.id !== warmupId)?.dataSize).toBe(0);
        await expect(page.getByTestId("grid-paste-status")).toContainText("independent copy without data");

        await openPasteSpecialAtAnchor(page);
        await page.getByTestId("paste-special-copy-with-data").click();
        await expect(page.getByTestId("yjs-table-view")).toHaveCount(3, { timeout: 60000 });
        state = await readGridProjectState(page);
        expect(state.tables.filter(table => table.id !== warmupId).map(table => table.dataSize).sort()).toEqual([0, 1]);

        await openPasteSpecialAtAnchor(page);
        await page.getByTestId("paste-special-values-only").click();
        await expect(page.getByTestId("grid-paste-status")).toContainText("Pasted values only");
        state = await readGridProjectState(page);
        expect(state.tables).toHaveLength(3);
        await expect(page.getByTestId("yjs-table-view")).toHaveCount(3);
    });
});
