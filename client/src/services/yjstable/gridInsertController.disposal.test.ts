import { afterAll, afterEach, expect, it } from "vitest";
import * as Y from "yjs";
import { createGrid, getGridHandles, setGridInsertTargetTableId } from "./gridDocs";
import { createGridInsertController } from "./gridInsertController";
import { ItemsRelationProvider } from "./itemsRelation";
import { resetPgliteForTests } from "./pgliteService";
import { createTable, getTableHandles, setSchemaText } from "./tableDocs";
import { resetTableEngineForTests } from "./tableEngine";
afterEach(resetTableEngineForTests);
afterAll(resetPgliteForTests);
function deferred() {
    let resolve!: () => void;
    const promise = new Promise<void>(done => {
        resolve = done;
    });
    return { promise, resolve };
}
it("disposal waits for its already-started provider preparation before engine reset", async () => {
    const doc = new Y.Doc(), started = deferred(), release = deferred();
    const table = getTableHandles(doc, createTable(doc, "A", "a"))!;
    setSchemaText(table, "CREATE TABLE a (id TEXT PRIMARY KEY)");
    const query = "SELECT id AS id FROM a";
    const grid = getGridHandles(doc, createGrid(doc, undefined, { query }))!;
    let connectionsClosed = 0;
    const controller = createGridInsertController({
        projectDoc: doc,
        projectId: "disposal-project",
        gridEntry: grid.entry,
        query,
        connect: async () => {
            started.resolve();
            await release.promise;
            return {
                waitForInitialSync: async () => ({ synced: true }),
                dispose() {
                    connectionsClosed++;
                },
            };
        },
    });
    try {
        await started.promise;
        let settled = false;
        const disposal = controller.dispose().then(() => {
            settled = true;
        });
        await Promise.resolve();
        expect(settled).toBe(false);
        release.resolve();
        await disposal;
        expect(settled).toBe(true);
        await resetTableEngineForTests();
        expect(connectionsClosed).toBe(1);
        await resetPgliteForTests();
    } finally {
        release.resolve();
        await controller.dispose();
    }
}, 60000);

it("settles a real preference refresh already awaiting its supplier before native cleanup", async () => {
    const doc = new Y.Doc(), started = deferred(), release = deferred();
    const query = "SELECT id AS id FROM outline_items";
    const grid = getGridHandles(doc, createGrid(doc, undefined, { query }))!;
    const controller = createGridInsertController({ projectDoc: doc, gridEntry: grid.entry, query });
    const original = ItemsRelationProvider.prototype.materialize;
    try {
        await new Promise<void>((resolve, reject) => {
            let stop = () => {};
            let settled = false;
            const timer = setTimeout(() => {
                stop();
                reject(new Error(JSON.stringify(controller.state)));
            }, 20000);
            stop = controller.subscribe(state => {
                if (!state.loading && state.resolution?.mode === "automatic" && state.candidates.length === 0) {
                    settled = true;
                    clearTimeout(timer);
                    stop();
                    resolve();
                }
            });
            if (settled) stop();
        });
        // Delay the real supplier's computed result, never replace its proof
        // or capability. The preference observer starts actual policy refresh.
        ItemsRelationProvider.prototype.materialize = async function() {
            const result = await original.call(this);
            started.resolve();
            await release.promise;
            return result;
        };
        setGridInsertTargetTableId(grid, "stale-table");
        const saved = Y.encodeStateAsUpdate(doc);
        await started.promise;
        let settled = false;
        const disposal = controller.dispose().then(() => {
            settled = true;
        });
        await Promise.resolve();
        expect(settled).toBe(false);
        release.resolve();
        await disposal;
        expect(settled).toBe(true);
        await resetTableEngineForTests();
        await resetPgliteForTests();
        expect(Y.encodeStateAsUpdate(doc)).toEqual(saved);
    } finally {
        release.resolve();
        await controller.dispose();
        ItemsRelationProvider.prototype.materialize = original;
    }
}, 60000);
