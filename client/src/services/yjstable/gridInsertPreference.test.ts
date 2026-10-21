import { afterAll, afterEach, describe, expect, it } from "vitest";
import * as Y from "yjs";
import {
    createGrid,
    getGridHandles,
    getGridInsertTargetTableId,
    setGridInsertTargetTableId,
    setGridQuery,
} from "./gridDocs";
import { createGridInsertController, type GridInsertController, type GridInsertState } from "./gridInsertController";
import { resetPgliteForTests } from "./pgliteService";
import { createTable, getTableHandles, setSchemaText } from "./tableDocs";
import { resetTableEngineForTests } from "./tableEngine";

// This fixture starts and closes a real WASM database. Keep its asynchronous
// observations and cleanup within the same budget as the integration case,
// including instrumented CI runs; Vitest's shorter defaults are insufficient.
const engineTimeout = 60_000;
afterEach(async () => await resetTableEngineForTests(), engineTimeout);
afterAll(async () => await resetPgliteForTests(), engineTimeout);

// Native initialization competes with coverage work in CI. Wait for the
// published policy, not a timer tick or merely a terminal failure state.
function waitForState(controller: GridInsertController, ready: (state: GridInsertState) => boolean) {
    return new Promise<void>((resolve, reject) => {
        let unsubscribe = () => {};
        let settled = false;
        const timer = setTimeout(() => {
            unsubscribe();
            reject(new Error(`INSERT readiness deadline: ${JSON.stringify(controller.state)}`));
        }, engineTimeout);
        unsubscribe = controller.subscribe(state => {
            if (!ready(state)) return;
            settled = true;
            clearTimeout(timer);
            unsubscribe();
            resolve();
        });
        if (settled) unsubscribe();
    });
}

describe("explicit Grid INSERT preference", { timeout: engineTimeout }, () => {
    it("isolates local history, merges disjoint peer fields and persists the exact Grid", () => {
        const doc = new Y.Doc();
        const id = createGrid(doc, undefined, { query: "SELECT 1 AS value" });
        const grid = getGridHandles(doc, id)!;
        const separate = getGridHandles(doc, createGrid(doc, undefined))!;
        const peer = new Y.Doc();
        Y.applyUpdate(peer, Y.encodeStateAsUpdate(doc));
        peer.getMap<Y.Map<unknown>>("yjsGrids").get(id)!.set("name", "Peer title");
        setGridInsertTargetTableId(grid, "stable-b");
        Y.applyUpdate(doc, Y.encodeStateAsUpdate(peer), "peer");
        expect(grid.undo.undoStack).toHaveLength(1);
        setGridInsertTargetTableId(grid, "stable-b");
        expect(grid.undo.undoStack).toHaveLength(1);
        grid.undo.undo();
        expect(getGridInsertTargetTableId(grid)).toBeUndefined();
        expect(grid.entry.get("name")).toBe("Peer title");
        expect(separate.entry.has("insertTargetTableId")).toBe(false);
        grid.undo.redo();
        expect(getGridInsertTargetTableId(grid)).toBe("stable-b");
        const restored = new Y.Doc();
        Y.applyUpdate(restored, Y.encodeStateAsUpdate(doc));
        expect(getGridInsertTargetTableId(getGridHandles(restored, id)!)).toBe("stable-b");
        setGridInsertTargetTableId(grid, undefined);
        const depth = grid.undo.undoStack.length;
        setGridInsertTargetTableId(grid, undefined);
        expect(grid.undo.undoStack).toHaveLength(depth);
        expect(grid.entry.has("sourceTableId")).toBe(false);
    });

    it("publishes supplier candidates, rejects outside choices, and leaves a stale preference dormant", async () => {
        const doc = new Y.Doc();
        const tables = ["a", "b", "c"].map(name => {
            const id = createTable(doc, "Same name", name);
            const handles = getTableHandles(doc, id)!;
            setSchemaText(handles, `CREATE TABLE ${name} (id TEXT PRIMARY KEY, title TEXT NOT NULL DEFAULT '${name}')`);
            return { id, handles };
        });
        const query = "SELECT id AS id, title AS title FROM a UNION ALL SELECT id AS id, title AS title FROM b";
        const grid = getGridHandles(doc, createGrid(doc, undefined, { query }))!;
        const controller = createGridInsertController({
            projectDoc: doc,
            gridEntry: grid.entry,
            query,
            connect: async () => ({ waitForInitialSync: async () => ({ synced: true }), dispose() {} }),
            onPreferenceChange: value => setGridInsertTargetTableId(grid, value),
        });
        try {
            await waitForState(controller, state =>
                !state.loading && state.resolution?.mode === "selection-required"
                && JSON.stringify(state.candidates.map(candidate => candidate.id).sort())
                    === JSON.stringify(tables.slice(0, 2).map(table => table.id).sort()));
            expect(controller.state.candidates.map(candidate => candidate.id).sort()).toEqual(
                tables.slice(0, 2).map(table => table.id).sort(),
            );
            expect(controller.state.resolution?.mode).toBe("selection-required");
            expect(grid.entry.has("insertTargetTableId")).toBe(false);
            expect(doc.share.has("sqlCatalog")).toBe(false);
            expect(await controller.savePreference(tables[2]!.id)).toBeDefined();
            expect(grid.undo.undoStack).toHaveLength(0);
            expect(await controller.savePreference(tables[1]!.id)).toBeUndefined();
            expect(await controller.submit()).toMatchObject({ status: "inserted", targetId: tables[1]!.id });
            expect(tables.map(table => table.handles.data.size)).toEqual([0, 1, 0]);
            setGridQuery(grid, "SELECT id AS id, title AS title FROM a");
            controller.setQuery("SELECT id AS id, title AS title FROM a");
            await waitForState(
                controller,
                state => !state.loading && state.resolution?.preferenceDiagnostic?.code === "not-a-supplier",
            );
            expect(await controller.submit()).toMatchObject({
                status: "inserted",
                targetId: tables[0]!.id,
                visibility: "represented",
            });
            const depth = grid.undo.undoStack.length;
            expect(await controller.savePreference(tables[1]!.id)).toBeDefined();
            expect(grid.undo.undoStack).toHaveLength(depth);
            expect(await controller.savePreference(undefined)).toBeUndefined();
            expect(grid.entry.has("insertTargetTableId")).toBe(false);
        } finally {
            await controller.dispose();
        }
    });
});
