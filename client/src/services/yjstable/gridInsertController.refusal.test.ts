import { afterAll, afterEach, describe, expect, it } from "vitest";
import * as Y from "yjs";
import { createGrid, getGridHandles } from "./gridDocs";
import { createGridInsertController } from "./gridInsertController";
import { resetPgliteForTests } from "./pgliteService";
import { createTable, getTableHandles, setSchemaText } from "./tableDocs";
import { resetTableEngineForTests, type TableDocConnector } from "./tableEngine";

const connect: TableDocConnector = async () => ({ waitForInitialSync: async () => ({ synced: true }), dispose() {} });

function table(doc: Y.Doc, sqlName: string) {
    const id = createTable(doc, sqlName.toUpperCase(), sqlName);
    const handles = getTableHandles(doc, id)!;
    setSchemaText(handles, `CREATE TABLE ${sqlName} (id TEXT PRIMARY KEY, value INTEGER DEFAULT 7)`);
    return { id, handles };
}

function insertController(doc: Y.Doc, query: string, sourceTableId: string, connector = connect, projectId?: string) {
    const gridId = createGrid(doc, sourceTableId, { query });
    const grid = getGridHandles(doc, gridId)!;
    return {
        grid,
        controller: createGridInsertController({
            projectDoc: doc,
            projectId,
            gridEntry: grid.entry,
            query,
            connect: connector,
        }),
    };
}

function tableEffects(...tables: ReturnType<typeof table>[]) {
    return tables.map(({ handles }) => ({ records: handles.data.size, history: handles.undo.undoStack.length }));
}

afterEach(async () => await resetTableEngineForTests());
afterAll(async () => await resetPgliteForTests());

describe("Grid INSERT refusal boundaries", { timeout: 30_000 }, () => {
    it("rejects an EXISTS-only dependency as an explicit UNION target without records or history", async () => {
        const doc = new Y.Doc({ guid: "grid-insert-exists-refusal" });
        const a = table(doc, "a");
        const b = table(doc, "b");
        const c = table(doc, "c");
        const query = "SELECT a.* FROM a WHERE EXISTS (SELECT 1 FROM b) UNION ALL SELECT c.* FROM c WHERE false";
        const run = insertController(doc, query, a.id);
        run.grid.entry.set("insertTargetTableId", b.id);
        const before = tableEffects(a, b, c);
        try {
            expect(await run.controller.submit()).toMatchObject({ status: "refused", mode: "invalid-selection" });
            expect(tableEffects(a, b, c)).toEqual(before);
        } finally {
            run.controller.dispose();
        }
    });

    it("rejects the real outline_items provider that requires a destination", async () => {
        const doc = new Y.Doc({ guid: "grid-insert-system-refusal" });
        const source = table(doc, "source");
        const run = insertController(doc, "SELECT * FROM outline_items", source.id);
        const before = tableEffects(source);
        try {
            expect(await run.controller.submit()).toEqual({
                status: "refused",
                mode: "unsupported",
                message: "This supplier cannot accept a destination-free Grid insertion",
            });
            expect(tableEffects(source)).toEqual(before);
            expect(run.grid.entry.has("insertTargetTableId")).toBe(false);
        } finally {
            run.controller.dispose();
        }
    });

    it("refuses a delayed intent after query, target, and schema authority change", async () => {
        const doc = new Y.Doc({ guid: "grid-insert-delayed-refusal" });
        const a = table(doc, "a");
        const b = table(doc, "b");
        let acquisitionStarted!: () => void;
        const started = new Promise<void>(resolve => acquisitionStarted = resolve);
        let resumeAcquisition!: () => void;
        const resume = new Promise<void>(resolve => resumeAcquisition = resolve);
        const delayed: TableDocConnector = async () => ({
            waitForInitialSync: async () => {
                acquisitionStarted();
                await resume;
                return { synced: true };
            },
            dispose() {},
        });
        const query = "SELECT * FROM a WHERE false";
        const run = insertController(doc, query, a.id, delayed, "delayed-project");
        try {
            const pending = run.controller.submit();
            await started;
            const nextQuery = "SELECT * FROM b WHERE false";
            run.grid.entry.set("query", nextQuery);
            run.grid.entry.set("insertTargetTableId", b.id);
            setSchemaText(a.handles, "CREATE TABLE a (id TEXT PRIMARY KEY, changed TEXT NOT NULL)");
            run.controller.setQuery(nextQuery);
            const effectsAfterAuthorityChanges = tableEffects(a, b);
            resumeAcquisition();
            expect(await pending).toMatchObject({ status: "refused", mode: "stale" });
            expect(tableEffects(a, b)).toEqual(effectsAfterAuthorityChanges);
        } finally {
            resumeAcquisition();
            run.controller.dispose();
        }
    });
});
