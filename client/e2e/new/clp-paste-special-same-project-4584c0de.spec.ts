/** @feature CLP-4584c0de */
import { expect, test } from "@playwright/test";
import {
    addSourceRecord,
    configureGrid,
    copyGridHosts,
    createBlankGrid,
    openPasteSpecialAtAnchor,
    readGridProjectState,
} from "../utils/crossProjectGridHelpers";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
import { TestHelpers } from "../utils/testHelpers";
registerCoverageHooks();

const SCHEMA = "CREATE TABLE tasks (\n  id TEXT PRIMARY KEY,\n  title TEXT NOT NULL,\n"
    + "  quantity INTEGER,\n  done BOOLEAN\n)";
const QUERY = "SELECT id, title, quantity, done FROM tasks";

test.describe("Paste Special in the source project", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        test.setTimeout(180000);
        await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
        await TestHelpers.seedProjectAndNavigate(page, testInfo, ["Paste anchor", "Source tail"]);
        await createBlankGrid(page, "Tasks", "tasks");
        await configureGrid(page, 0, SCHEMA, QUERY, "Task title");
        await addSourceRecord(page);
        await copyGridHosts(page);
    });

    test("offers and applies every same-project variant", async ({ page }) => {
        const source = await readGridProjectState(page);
        expect(source.tables).toHaveLength(1);
        expect(source.tables[0].dataSize).toBe(1);

        await openPasteSpecialAtAnchor(page);
        await expect(page.getByTestId("paste-special-another-view")).toBeEnabled();
        await page.getByTestId("paste-special-another-view").click();
        await expect(page.getByTestId("yjs-table-view")).toHaveCount(2, { timeout: 30000 });
        let state = await readGridProjectState(page);
        expect(state.tables).toHaveLength(1);
        expect(new Set(state.hostTableIds)).toEqual(new Set([source.tables[0].id]));

        await openPasteSpecialAtAnchor(page);
        await page.getByTestId("paste-special-copy-with-data").click();
        await expect(page.getByTestId("yjs-table-view")).toHaveCount(3, { timeout: 30000 });
        state = await readGridProjectState(page);
        expect(state.tables).toHaveLength(2);
        expect(state.tables.map(table => table.dataSize).sort()).toEqual([1, 1]);

        await openPasteSpecialAtAnchor(page);
        await page.getByTestId("paste-special-copy-without-data").click();
        await expect(page.getByTestId("yjs-table-view")).toHaveCount(4, { timeout: 30000 });
        state = await readGridProjectState(page);
        expect(state.tables).toHaveLength(3);
        expect(state.tables.map(table => table.dataSize).sort()).toEqual([0, 1, 1]);

        await openPasteSpecialAtAnchor(page);
        await page.getByTestId("paste-special-values-only").click();
        await expect(page.getByTestId("paste-special-dialog")).toHaveCount(0);
        await expect(page.getByTestId("grid-paste-status")).toContainText("Pasted values only");
        state = await readGridProjectState(page);
        expect(state.tables).toHaveLength(3);
        await expect(page.getByTestId("yjs-table-view")).toHaveCount(4);
        await expect(page.locator("textarea.global-textarea")).toBeFocused();
    });
});
