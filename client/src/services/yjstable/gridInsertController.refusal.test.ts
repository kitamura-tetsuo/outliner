import { afterAll, afterEach, describe, expect, it } from "vitest";
import * as Y from "yjs";
import { createGrid, getGridHandles } from "./gridDocs";
import { createGridInsertController } from "./gridInsertController";
import { resetPgliteForTests } from "./pgliteService";
import { TABLE_RELATION_CAPABILITIES } from "./relationProvider";
import { createTable, getTableHandles, setSchemaText } from "./tableDocs";
import { resetTableEngineForTests, type TableDocConnector } from "./tableEngine";

const connect: TableDocConnector = async () => ({ waitForInitialSync: async () => ({ synced: true }), dispose() {} });

function table(doc: Y.Doc, sqlName: string) {
    const id = createTable(doc, sqlName.toUpperCase(), sqlName);
    const handles = getTableHandles(doc, id)!;
    setSchemaText(handles, `CREATE TABLE ${sqlName} (id TEXT PRIMARY KEY, value INTEGER DEFAULT 7)`);
    return { id, handles };
}

function insertController(doc: Y.Doc, query: string, connector = connect, projectId?: string) {
    const gridId = createGrid(doc, { query });
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
        const run = insertController(doc, query);
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
        const run = insertController(doc, "SELECT * FROM outline_items");
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

    it.each(["query-a-b-a", "preference", "schema"] as const)(
        "refuses a delayed intent after an independent %s authority change",
        async (change) => {
            const doc = new Y.Doc({ guid: `grid-insert-delayed-${change}` });
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
            const run = insertController(doc, query, delayed, "delayed-project");
            try {
                const pending = run.controller.submit();
                await started;
                if (change === "query-a-b-a") {
                    const otherQuery = "SELECT * FROM b WHERE false";
                    run.grid.entry.set("query", otherQuery);
                    run.controller.setQuery(otherQuery);
                    run.grid.entry.set("query", query);
                    run.controller.setQuery(query);
                } else if (change === "preference") {
                    run.grid.entry.set("insertTargetTableId", b.id);
                } else {
                    setSchemaText(a.handles, "CREATE TABLE a (id TEXT PRIMARY KEY, changed TEXT NOT NULL)");
                }
                const effectsAfterAuthorityChanges = tableEffects(a, b);
                resumeAcquisition();
                expect(await pending).toMatchObject({ status: "refused", mode: "stale" });
                expect(tableEffects(a, b)).toEqual(effectsAfterAuthorityChanges);
            } finally {
                resumeAcquisition();
                run.controller.dispose();
            }
        },
    );

    it("refuses a delayed intent after provider INSERT permission is revoked", async () => {
        const doc = new Y.Doc({ guid: "grid-insert-delayed-permission" });
        const a = table(doc, "a");
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
        const run = insertController(doc, "SELECT * FROM a WHERE false", delayed, "permission-project");
        const insertCapability = TABLE_RELATION_CAPABILITIES.insert;
        try {
            const pending = run.controller.submit();
            await started;
            delete TABLE_RELATION_CAPABILITIES.insert;
            const effectsAfterRevocation = tableEffects(a);
            resumeAcquisition();
            expect(await pending).toMatchObject({ status: "refused", mode: "unavailable" });
            expect(tableEffects(a)).toEqual(effectsAfterRevocation);
        } finally {
            TABLE_RELATION_CAPABILITIES.insert = insertCapability;
            resumeAcquisition();
            run.controller.dispose();
        }
    });
});
