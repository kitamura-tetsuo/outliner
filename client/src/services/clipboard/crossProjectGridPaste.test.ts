import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import * as Y from "yjs";
import { resetPgliteForTests } from "../yjstable/pgliteService";
import { exportTableStructure } from "../yjstable/tableClone";
import { addRecord, createTable, getTableHandles, listTables, setSchemaText } from "../yjstable/tableDocs";
import { cloneGridTablesAcrossProjects, formatGridPasteReport, type GridPasteOutcome } from "./crossProjectGridPaste";
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
            requestedSourceTableIds: [ordersId],
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
            requestedSourceTableIds: [ordersId],
            isDestinationCurrent: () => true,
        });

        const destinationTableId = cloneResult!.tableIdMap[ordersId];
        expect(destinationTableId).toBeTypeOf("string");
        expect(getTableHandles(destination, destinationTableId)!.data.size).toBe(0);
        expect(progress.events).toEqual([
            { state: "copying", tableCount: 1 },
            {
                state: "complete-without-data",
                reason: "The source project is not available.",
                report: ["Orders pasted without rows: The source project is not available."],
            },
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
            requestedSourceTableIds: [ordersId],
            isDestinationCurrent: () => false,
        });

        expect(cloneResult).toBe(undefined);
        expect(listTables(destination)).toEqual([]);
        expect(progress.events.at(-1)).toEqual({ state: "cancelled" });
    });

    it("renders every consequential outcome by name and suppresses a clean paste", () => {
        const cloned: GridPasteOutcome = {
            type: "cloned",
            sourceTableId: "report",
            destinationTableId: "new-report",
            tableName: "Q3 report",
            sqlName: "q3_report",
            selected: true,
            rowCount: 1240,
        };
        expect(formatGridPasteReport([cloned])).toEqual([]);

        expect(formatGridPasteReport([
            cloned,
            { type: "dependency-added", sourceTableId: "sales", tableName: "sales" },
            { type: "renamed", sourceTableId: "sales", tableName: "sales", from: "sales", to: "sales_2" },
            {
                type: "failed-group",
                sourceTableIds: ["headcount"],
                tableNames: ["Headcount"],
                reason: "SQL validation failed",
            },
            { type: "rebound", sourceTableId: "tasks", tableName: "Open tasks", relation: "outline_items" },
            {
                type: "schedule-skipped",
                sourceTableId: "routine",
                tableName: "routine_occurrences",
                ruleName: "Daily routines",
            },
            { type: "cut-source-retained", tableNames: ["Q3 report"] },
        ])).toEqual([
            "Q3 report pasted as an independent copy, with 1,240 rows.",
            "Also copied 1 table its query depends on: sales.",
            "sales was renamed from sales to sales_2 in this project.",
            "Headcount was not pasted: SQL validation failed.",
            "Open tasks now reads this project's outline_items.",
            "routine_occurrences has schedule rule Daily routines that was not copied — recreate it here if the rows should keep generating.",
            "Cut left the source table in place: Q3 report.",
        ]);
    });
});
