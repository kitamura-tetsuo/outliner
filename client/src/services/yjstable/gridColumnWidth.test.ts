// Per-column Grid width overrides (issue #5455): the saved `widthPx` leaf is
// part of a Grid's shared presentation state. These tests exercise the
// supported production paths end to end — normal creation/editing writers,
// actual Yjs updates, fresh-document readers, persistence restart, Grid
// Duplicate, delete/Undo, and the real structural clipboard
// export/validate/reconstruct path — never a prebuilt snapshot or local-only
// state.

import { Project } from "$shared/app-schema";
import { afterAll, describe, expect, it } from "vitest";
import * as Y from "yjs";
import { isGridTableSnapshot } from "../clipboard/itemClipboard";
import { globalUndoRouter } from "../undo/undoRouter.svelte";
import {
    createGrid,
    duplicateGrid,
    findGridsBySourceTable,
    getGridColumnWidth,
    getGridHandles,
    getGridQuery,
    isValidGridColumnWidth,
    listGrids,
    readGridComponents,
    removeGridWithPlacements,
    setGridColumnOrder,
    setGridColumnWidth,
    setGridComponentField,
} from "./gridDocs";
import { resetPgliteForTests } from "./pgliteService";
import { exportTableStructure, importTableStructures } from "./tableClone";
import { createTable, getTableHandles, listTables, setSchemaText } from "./tableDocs";

const INVALID_WIDTHS = [31, 4097, 0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, "180", true, null];

function basicProject(): { doc: Y.Doc; tableId: string; gridA: string; gridB: string; } {
    const doc = new Y.Doc();
    const tableId = createTable(doc, "Tasks", "tasks");
    const gridA = createGrid(doc, tableId, {
        name: "A",
        query: "SELECT id, title, done FROM tasks",
        components: { title: { widthPx: 180 } },
    });
    const gridB = createGrid(doc, tableId, { name: "B", query: "SELECT id, title, done FROM tasks" });
    return { doc, tableId, gridA, gridB };
}

describe("Grid column width overrides", () => {
    it("shares widths per Grid with boundaries, and rejects invalid values without effect", () => {
        const { doc, gridA, gridB } = basicProject();
        const first = getGridHandles(doc, gridA)!;
        const second = getGridHandles(doc, gridA)!;
        const other = getGridHandles(doc, gridB)!;

        setGridColumnWidth(first, "done", 32);
        expect(getGridColumnWidth(second, "done")).toBe(32);
        expect(readGridComponents(second).widths).toEqual({ title: 180, done: 32 });
        expect(getGridColumnWidth(other, "title")).toBeUndefined();
        expect(getGridColumnWidth(other, "done")).toBeUndefined();
        expect(getGridQuery(other)).toBe("SELECT id, title, done FROM tasks");
        expect(listTables(doc)).toHaveLength(1);

        setGridColumnWidth(first, "done", 4096);
        expect(getGridColumnWidth(second, "done")).toBe(4096);
        setGridColumnWidth(first, "done", 32);

        for (const invalid of INVALID_WIDTHS) {
            expect(() => setGridColumnWidth(first, "done", invalid as number)).toThrow(/Invalid widthPx/);
            expect(() => setGridComponentField(first, "done", "widthPx", invalid as number)).toThrow(
                /Invalid widthPx/,
            );
        }
        expect(getGridColumnWidth(second, "done")).toBe(32);
        expect(readGridComponents(second).widths).toEqual({ title: 180, done: 32 });

        const gridsBefore = listGrids(doc).length;
        for (const invalid of INVALID_WIDTHS) {
            expect(() =>
                createGrid(doc, listTables(doc)[0].tableId, { components: { x: { widthPx: invalid as number } } })
            )
                .toThrow(/Invalid widthPx/);
        }
        expect(listGrids(doc)).toHaveLength(gridsBefore);

        expect(isValidGridColumnWidth(32)).toBe(true);
        expect(isValidGridColumnWidth(4096)).toBe(true);
        expect(isValidGridColumnWidth(31)).toBe(false);
        expect(isValidGridColumnWidth(1.5)).toBe(false);
        expect(isValidGridColumnWidth(Number.NaN)).toBe(false);
    });

    it("treats repeat sets and absent resets as no-ops with no update, history, or empty map", () => {
        const { doc, gridA } = basicProject();
        const handles = getGridHandles(doc, gridA)!;
        let updates = 0;
        doc.on("update", () => updates++);
        const stackBefore = handles.undo.undoStack.length;

        setGridColumnWidth(handles, "title", 180);
        setGridColumnWidth(handles, "fresh", undefined);
        expect(updates).toBe(0);
        expect(handles.undo.undoStack.length).toBe(stackBefore);
        expect(handles.components.has("fresh")).toBe(false);

        setGridColumnWidth(handles, "title", 200);
        expect(updates).toBeGreaterThan(0);
        expect(getGridColumnWidth(handles, "title")).toBe(200);
    });

    it("resets only the override and preserves every other component field", () => {
        const { doc, gridA } = basicProject();
        const handles = getGridHandles(doc, gridA)!;
        setGridComponentField(handles, "title", "label", "Subject");
        setGridComponentField(handles, "title", "hidden", true);

        setGridColumnWidth(handles, "title", undefined);
        expect(getGridColumnWidth(handles, "title")).toBeUndefined();
        const read = readGridComponents(handles);
        expect(read.widths).toEqual({});
        expect(read.labels.title).toBe("Subject");
        expect(read.hidden.title).toBe(true);
    });

    it("keys widths by exact result-column name and retains dormant preferences", () => {
        const { doc, gridA } = basicProject();
        const handles = getGridHandles(doc, gridA)!;
        const queryBefore = getGridQuery(handles);

        for (const column of ["a.b", "__proto__", "constructor"]) {
            setGridColumnWidth(handles, column, 120);
        }
        setGridComponentField(handles, "title", "label", "Name");
        setGridComponentField(handles, "done", "label", "Name");
        const read = readGridComponents(handles);
        expect(read.widths["__proto__"]).toBe(120);
        expect(read.widths["a.b"]).toBe(120);
        expect(read.widths["constructor"]).toBe(120);
        expect(read.widths["valueOf"]).toBeUndefined();
        expect(read.widths["done"]).toBeUndefined();

        setGridComponentField(handles, "title", "hidden", true);
        setGridColumnOrder(handles, ["done", "title", "a.b"]);
        const after = readGridComponents(handles);
        expect(after.widths["title"]).toBe(180);
        expect(after.widths["a.b"]).toBe(120);
        expect(after.hidden["title"]).toBe(true);
        expect(getGridQuery(handles)).toBe(queryBefore);
        // Retaining a dormant preference never fabricates a query projection.
        expect(getGridQuery(handles)).not.toContain("__proto__");
    });

    it("duplicates widths with the definition and keeps the duplicate independent", () => {
        const { doc, tableId, gridA } = basicProject();
        const source = getGridHandles(doc, gridA)!;
        setGridColumnWidth(source, "ghost", 64);
        setGridComponentField(source, "done", "hidden", true);

        const dupId = duplicateGrid(doc, gridA)!;
        expect(dupId).not.toBe(gridA);
        const dup = getGridHandles(doc, dupId)!;
        expect(getGridColumnWidth(dup, "title")).toBe(180);
        expect(getGridColumnWidth(dup, "ghost")).toBe(64);
        expect(listTables(doc)).toHaveLength(1);

        setGridColumnWidth(dup, "title", 300);
        expect(getGridColumnWidth(source, "title")).toBe(180);
        expect(getGridHandles(doc, dupId)!.entry.get("sourceTableId")).toBe(tableId);
    });

    it("restores valid widths, including dormant ones and absence, through delete/Undo", () => {
        const project = Project.createInstance("proj-width");
        const tableId = createTable(project.ydoc, "T", "t");
        const gridId = createGrid(project.ydoc, tableId, {
            name: "G",
            query: "SELECT id, t FROM t",
            components: { t: { label: "Tee", widthPx: 200 }, ghost: { widthPx: 64 } },
        });

        expect(removeGridWithPlacements(project, gridId)).toBe(true);
        expect(getGridHandles(project.ydoc, gridId)).toBeUndefined();
        globalUndoRouter.undo();

        const restored = getGridHandles(project.ydoc, gridId)!;
        expect(getGridColumnWidth(restored, "t")).toBe(200);
        expect(getGridColumnWidth(restored, "ghost")).toBe(64);
        expect(getGridColumnWidth(restored, "id")).toBeUndefined();
        expect(readGridComponents(restored).labels["t"]).toBe("Tee");
    });
});

describe("Grid width structural copy", { timeout: 30000 }, () => {
    afterAll(async () => {
        await resetPgliteForTests();
    });

    function widthProject(): { doc: Y.Doc; tableId: string; } {
        const doc = new Y.Doc({ guid: "width-source" });
        const tableId = createTable(doc, "Tasks", "tasks");
        setSchemaText(
            getTableHandles(doc, tableId)!,
            "CREATE TABLE tasks (id TEXT PRIMARY KEY, title TEXT, done BOOLEAN)",
        );
        createGrid(doc, tableId, {
            name: "Tasks grid",
            query: "SELECT id, title, done FROM tasks",
            columnOrder: ["title", "id", "done"],
            // Built from entries: a "__proto__" object-literal key would set
            // the seed's prototype instead of seeding the column.
            components: Object.fromEntries([
                ["title", { type: "text", label: "Subject", widthPx: 180 }],
                ["done", { hidden: true, widthPx: 32 }],
                ["ghost", { widthPx: 64 }],
                ["__proto__", { widthPx: 100 }],
            ]),
        });
        return { doc, tableId };
    }

    it("exports, validates and reconstructs widths without changing clone decisions", async () => {
        const { doc, tableId } = widthProject();
        const snapshot = exportTableStructure(doc, tableId);
        expect(isGridTableSnapshot(snapshot, tableId)).toBe(true);
        expect(snapshot.ui.components["title"].widthPx).toBe(180);
        expect(snapshot.ui.components["done"].widthPx).toBe(32);
        expect(snapshot.ui.components["ghost"].widthPx).toBe(64);
        expect(snapshot.ui.components["__proto__"].widthPx).toBe(100);

        const destination = new Y.Doc({ guid: "width-destination" });
        const result = await importTableStructures(destination, { [tableId]: snapshot }, "width-source");
        expect(result.failures).toEqual({});
        const destTableId = result.tableIdMap[tableId];
        const destGrid = getGridHandles(
            destination,
            findGridsBySourceTable(destination, destTableId)[0].gridId,
        )!;
        expect(getGridColumnWidth(destGrid, "title")).toBe(180);
        expect(getGridColumnWidth(destGrid, "done")).toBe(32);
        expect(getGridColumnWidth(destGrid, "ghost")).toBe(64);
        expect(getGridColumnWidth(destGrid, "__proto__")).toBe(100);

        // The same input without widths takes the identical clone branch.
        const stripped = JSON.parse(JSON.stringify(snapshot)) as typeof snapshot;
        for (const cfg of Object.values(stripped.ui.components)) delete cfg.widthPx;
        const plainDestination = new Y.Doc({ guid: "width-plain-destination" });
        const plain = await importTableStructures(plainDestination, { [tableId]: stripped }, "width-source");
        const projectOutcome = (entry: { type: string; sqlName?: string; tableName?: string; }) => ({
            type: entry.type,
            sqlName: (entry as { sqlName?: string; }).sqlName,
            tableName: (entry as { tableName?: string; }).tableName,
        });
        expect(result.outcomes.map(projectOutcome)).toEqual(plain.outcomes.map(projectOutcome));
        expect(result.failures).toEqual(plain.failures);
        const plainGrid = getGridHandles(
            plainDestination,
            findGridsBySourceTable(plainDestination, plain.tableIdMap[tableId])[0].gridId,
        )!;
        expect(getGridColumnWidth(plainGrid, "title")).toBeUndefined();

        // A later width change on the reconstruction stays independent.
        setGridColumnWidth(destGrid, "title", 300);
        expect(getGridColumnWidth(getGridHandles(doc, findGridsBySourceTable(doc, tableId)[0].gridId)!, "title"))
            .toBe(180);
    });

    it("rejects invalid DTO widths before any destination effect", async () => {
        const { doc, tableId } = widthProject();
        const snapshot = exportTableStructure(doc, tableId);
        snapshot.ui.components["title"].widthPx = 31;
        expect(isGridTableSnapshot(snapshot, tableId)).toBe(false);

        const destination = new Y.Doc({ guid: "width-invalid-destination" });
        const result = await importTableStructures(destination, { [tableId]: snapshot }, "width-source");
        expect(result.tableIdMap[tableId]).toBeUndefined();
        expect(Object.keys(result.failures)).toEqual([tableId]);
        expect(listTables(destination)).toHaveLength(0);
    });

    it("exports a malformed stored width as automatic sizing instead of failing", () => {
        const { doc, tableId } = widthProject();
        const handles = getGridHandles(doc, findGridsBySourceTable(doc, tableId)[0].gridId)!;
        (handles.components.get("title") as Y.Map<unknown>).set("widthPx", "180");

        expect(getGridColumnWidth(handles, "title")).toBeUndefined();
        const snapshot = exportTableStructure(doc, tableId);
        expect(isGridTableSnapshot(snapshot, tableId)).toBe(true);
        expect(snapshot.ui.components["title"].widthPx).toBeUndefined();
    });
});

describe("Grid width collaboration", () => {
    function syncedPair(): { docA: Y.Doc; docB: Y.Doc; gridId: string; } {
        const docA = new Y.Doc();
        const tableId = createTable(docA, "Tasks", "tasks");
        const gridId = createGrid(docA, tableId, {
            name: "A",
            query: "SELECT id, title FROM tasks",
            components: { title: { label: "Title" } },
        });
        const docB = new Y.Doc();
        Y.applyUpdate(docB, Y.encodeStateAsUpdate(docA));
        return { docA, docB, gridId };
    }

    function exchange(docA: Y.Doc, docB: Y.Doc): void {
        Y.applyUpdate(docB, Y.encodeStateAsUpdate(docA));
        Y.applyUpdate(docA, Y.encodeStateAsUpdate(docB));
    }

    it("merges a width leaf with a disjoint label leaf and converges same-width edits", () => {
        const { docA, docB, gridId } = syncedPair();
        setGridColumnWidth(getGridHandles(docA, gridId)!, "title", 180);
        setGridComponentField(getGridHandles(docB, gridId)!, "title", "label", "Renamed");
        exchange(docA, docB);

        for (const doc of [docA, docB]) {
            expect(getGridColumnWidth(getGridHandles(doc, gridId)!, "title")).toBe(180);
            expect(readGridComponents(getGridHandles(doc, gridId)!).labels["title"]).toBe("Renamed");
        }

        setGridColumnWidth(getGridHandles(docA, gridId)!, "title", 100);
        setGridColumnWidth(getGridHandles(docB, gridId)!, "title", 200);
        exchange(docA, docB);
        const convergedA = getGridColumnWidth(getGridHandles(docA, gridId)!, "title");
        const convergedB = getGridColumnWidth(getGridHandles(docB, gridId)!, "title");
        expect(convergedA).toBe(convergedB);
        expect(convergedA === 100 || convergedA === 200).toBe(true);
    });

    it("isolates width Undo/Redo and restores widths from a restarted document", () => {
        const { docA, docB, gridId } = syncedPair();
        const handles = getGridHandles(docA, gridId)!;
        handles.undo.stopCapturing();

        setGridColumnWidth(handles, "title", 250);
        expect(getGridColumnWidth(handles, "title")).toBe(250);
        handles.undo.undo();
        expect(getGridColumnWidth(handles, "title")).toBeUndefined();
        expect(readGridComponents(handles).labels["title"]).toBe("Title");
        handles.undo.redo();
        expect(getGridColumnWidth(handles, "title")).toBe(250);

        exchange(docA, docB);
        const bytes = Y.encodeStateAsUpdate(docA);
        const restarted = new Y.Doc();
        Y.applyUpdate(restarted, bytes);
        expect(getGridColumnWidth(getGridHandles(restarted, gridId)!, "title")).toBe(250);
        expect(readGridComponents(getGridHandles(restarted, gridId)!).labels["title"]).toBe("Title");
    });
});
