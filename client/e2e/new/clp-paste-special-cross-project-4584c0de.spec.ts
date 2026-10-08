/** @feature CLP-4584c0de */
import type { Page } from "@playwright/test";
import { expect, test } from "../fixtures/grid-render-trace";
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

/**
 * Snapshot the destination outline as (id, text, depth, component binding)
 * rows read straight from Yjs. `project.items` holds the project's pages, so
 * the walk starts one level in — the same shape the paste-restores-hierarchy
 * spec uses. A values-only paste inserts rendered clipboard text without
 * creating tables, so the table-registry checks below cannot observe it; only
 * this outline snapshot rejects cancellation that performs a paste.
 */
async function readOutlineSnapshot(page: Page): Promise<
    Array<{
        id: string;
        text: string;
        depth: number;
        componentType: string | null;
        yjsTableId: string | null;
    }>
> {
    return page.evaluate(() => {
        // eslint-disable-next-line no-restricted-globals
        const project = (window as any).__YJS_STORE__?.yjsClient?.getProject();
        if (!project) throw new Error("Current Yjs project is unavailable");
        const rows: Array<{
            id: string;
            text: string;
            depth: number;
            componentType: string | null;
            yjsTableId: string | null;
        }> = [];
        const walk = (items: any, depth: number) => {
            for (let index = 0; index < items.length; index++) {
                const item = items.at(index);
                if (!item) continue;
                rows.push({
                    id: String(item.id ?? ""),
                    text: String(item.text ?? ""),
                    depth,
                    componentType: (item.componentType as string | undefined) ?? null,
                    yjsTableId: (item.yjsTableId as string | undefined) ?? null,
                });
                if (item.items) walk(item.items, depth + 1);
            }
        };
        for (let index = 0; index < project.items.length; index++) {
            const pageItem = project.items.at(index);
            if (pageItem?.items) walk(pageItem.items, 0);
        }
        return rows;
    });
}

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

        const outlineBeforeCancel = await readOutlineSnapshot(page);
        await openPasteSpecialAtAnchor(page);
        const dialog = page.getByTestId("paste-special-dialog");
        await expect(dialog).toHaveJSProperty("open", true);
        const anotherView = page.getByTestId("paste-special-another-view");
        await expect(anotherView).toBeDisabled();
        await expect(anotherView).toContainText("belongs to another project");
        await expect(page.getByTestId("paste-special-copy-with-data")).toBeFocused();
        // Cancelling reports no selection: Escape closes the dialog without
        // pasting. A values-only resolution leaves the table registry
        // unchanged, so the outline snapshot — item IDs, text, hierarchy, and
        // component bindings — is the oracle that rejects a paste on cancel.
        await page.keyboard.press("Escape");
        await expect(dialog).toHaveCount(0);
        let state = await readGridProjectState(page);
        expect(state.tables).toHaveLength(1);
        expect(state.tables[0].id).toBe(warmupId);
        // Give a wrongful paste one beat to land before asserting no change,
        // so the oracle cannot pass by reading too early.
        await page.waitForTimeout(1000);
        expect(await readOutlineSnapshot(page)).toEqual(outlineBeforeCancel);
        await expect(page.getByTestId("grid-paste-status")).not.toContainText("Pasted values only");

        await openPasteSpecialAtAnchor(page);
        await page.getByTestId("paste-special-copy-without-data").click();
        await expect(page.getByTestId("yjs-table-view")).toHaveCount(2, { timeout: 60000 });
        state = await readGridProjectState(page);
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
