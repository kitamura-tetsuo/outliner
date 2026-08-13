import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import * as Y from "yjs";
import { resetPgliteForTests } from "../yjstable/pgliteService";
import { exportTableStructure } from "../yjstable/tableClone";
import { addRecord, createTable, getTableHandles, listTables, setSchemaText } from "../yjstable/tableDocs";
import { cloneGridTablesAcrossProjects } from "./crossProjectGridPaste";
import { GRID_PASTE_PROGRESS_EVENT, GRID_PASTE_WRITE_CHECK_EVENT, type GridPasteProgress } from "./gridPasteEvents";

// The live source room belongs to the cross-project E2E coverage: these cases
// are about what happens around it, so the project registry reports the source
// as unreachable rather than opening a WebSocket out of JSDOM.
vi.mock("../../lib/yjsService.svelte", () => ({
    acquireClientByProjectId: () => Promise.resolve(undefined),
}));

const SOURCE_PROJECT_ID = "source-project";

function sourceProject(): { doc: Y.Doc; ordersId: string; } {
    const doc = new Y.Doc({ guid: SOURCE_PROJECT_ID });
    const ordersId = createTable(doc, "Orders", "orders");
    const orders = getTableHandles(doc, ordersId)!;
    setSchemaText(orders, "CREATE TABLE orders (id TEXT PRIMARY KEY, amount INTEGER)");
    orders.uiDef.set("query", "SELECT id, amount FROM orders");
    addRecord(orders, { amount: 42 }, "o1");
    return { doc, ordersId };
}

function recordProgress(): { events: GridPasteProgress[]; stop: () => void; } {
    const events: GridPasteProgress[] = [];
    const listener = (event: Event) => events.push((event as CustomEvent<GridPasteProgress>).detail);
    window.addEventListener(GRID_PASTE_PROGRESS_EVENT, listener);
    return { events, stop: () => window.removeEventListener(GRID_PASTE_PROGRESS_EVENT, listener) };
}

const cleanups: (() => void)[] = [];

afterEach(() => {
    while (cleanups.length > 0) cleanups.pop()!();
});

afterAll(async () => {
    await resetPgliteForTests();
});

describe("cloneGridTablesAcrossProjects", { timeout: 30000 }, () => {
    it("creates nothing at all when the destination refuses writes", async () => {
        const { doc: source, ordersId } = sourceProject();
        const destination = new Y.Doc({ guid: "read-only-destination" });
        const refuse = (event: Event) => event.preventDefault();
        window.addEventListener(GRID_PASTE_WRITE_CHECK_EVENT, refuse);
        cleanups.push(() => window.removeEventListener(GRID_PASTE_WRITE_CHECK_EVENT, refuse));
        const progress = recordProgress();
        cleanups.push(progress.stop);

        const cloneResult = await cloneGridTablesAcrossProjects({
            destinationDoc: destination,
            sourceProjectId: SOURCE_PROJECT_ID,
            snapshots: { [ordersId]: exportTableStructure(source, ordersId) },
            isDestinationCurrent: () => true,
        });

        expect(cloneResult).toBe(undefined);
        expect(listTables(destination)).toEqual([]);
        expect(progress.events).toEqual([
            { state: "failed", reason: "The destination project is read-only." },
        ]);
    });

    it("clones the structure and says why the rows are missing when the source is unreachable", async () => {
        const { doc: source, ordersId } = sourceProject();
        const destination = new Y.Doc({ guid: "destination" });
        const progress = recordProgress();
        cleanups.push(progress.stop);

        const cloneResult = await cloneGridTablesAcrossProjects({
            destinationDoc: destination,
            sourceProjectId: SOURCE_PROJECT_ID,
            snapshots: { [ordersId]: exportTableStructure(source, ordersId) },
            isDestinationCurrent: () => true,
        });

        const destinationTableId = cloneResult!.tableIdMap[ordersId];
        expect(destinationTableId).toBeTypeOf("string");
        expect(getTableHandles(destination, destinationTableId)!.data.size).toBe(0);
        expect(progress.events).toEqual([
            { state: "copying", tableCount: 1 },
            { state: "complete-without-data", reason: "The source project is not available." },
        ]);
    });

    it("leaves no table behind when the user navigates away mid-paste", async () => {
        const { doc: source, ordersId } = sourceProject();
        const destination = new Y.Doc({ guid: "abandoned-destination" });
        const progress = recordProgress();
        cleanups.push(progress.stop);

        const cloneResult = await cloneGridTablesAcrossProjects({
            destinationDoc: destination,
            sourceProjectId: SOURCE_PROJECT_ID,
            snapshots: { [ordersId]: exportTableStructure(source, ordersId) },
            isDestinationCurrent: () => false,
        });

        expect(cloneResult).toBe(undefined);
        expect(listTables(destination)).toEqual([]);
        expect(progress.events.at(-1)).toEqual({ state: "cancelled" });
    });
});
