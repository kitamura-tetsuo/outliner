import { afterAll, afterEach, describe, expect, it } from "vitest";
import * as Y from "yjs";
import { globalUndoRouter } from "../undo/undoRouter.svelte";
import { createGrid, getGridHandles } from "./gridDocs";
import { createGridInsertController } from "./gridInsertController";
import { resetPgliteForTests, runSelect } from "./pgliteService";
import { projectSchemaName } from "./sqlNames";
import { createTable, getTableHandles, setSchemaText } from "./tableDocs";
import { createTableEngineSession, resetTableEngineForTests, type TableDocConnector } from "./tableEngine";

// Transport establishment only; schema, SELECT, provider and writes are real.
const connect: TableDocConnector = async () => ({ waitForInitialSync: async () => ({ synced: true }), dispose() {} });
afterEach(async () => {
    globalUndoRouter.clear();
    await resetTableEngineForTests();
});
afterAll(async () => await resetPgliteForTests());

async function fixture(schema: string, filtered = false) {
    const doc = new Y.Doc();
    const targetId = createTable(doc, "Target", "target");
    const otherId = createTable(doc, "Unrelated", "other");
    const target = getTableHandles(doc, targetId)!;
    const other = getTableHandles(doc, otherId)!;
    setSchemaText(target, schema);
    setSchemaText(other, "CREATE TABLE other (id TEXT PRIMARY KEY, note TEXT)");
    const engine = createTableEngineSession({ projectDoc: doc, projectId: doc.guid, connect });
    const acquired = (await engine.acquire(targetId))!;
    expect(acquired.adapter.appliedSchema?.createSql).toBe(schema);
    expect(await engine.acquire(otherId)).toBeDefined();
    const provider = (await engine.resolveRelation("target"))!;
    const query = `SELECT id AS id FROM target${filtered ? " WHERE false" : ""}`;
    const grid = getGridHandles(doc, createGrid(doc, undefined, { query }))!;
    const controller = createGridInsertController({
        projectDoc: doc,
        projectId: doc.guid,
        gridEntry: grid.entry,
        query,
        connect,
        // Same ordinary history boundary supplied by YjsTableView.
        onBeforeEffects: () => globalUndoRouter.stopCapturing(),
    });
    let errors: unknown[] = [];
    const unsubscribe = acquired.adapter.subscribe({ onRecordErrors: next => errors = [...next] });
    const sqlRows = async () =>
        (await runSelect(`SELECT * FROM "${projectSchemaName(doc.guid)}".target ORDER BY id`)).rows;
    const snapshot = async () => ({
        records: target.data.toJSON(),
        undo: target.undo.undoStack.length,
        redo: target.undo.redoStack.length,
        sql: await sqlRows(),
        errors: [...errors],
        grid: grid.entry.toJSON(),
        other: other.data.toJSON(),
        otherUndo: other.undo.undoStack.length,
        otherRedo: other.undo.redoStack.length,
    });
    return {
        doc,
        target,
        other,
        grid,
        controller,
        provider,
        sqlRows,
        snapshot,
        close() {
            unsubscribe();
            controller.dispose();
            engine.dispose();
        },
    };
}

describe("Grid INSERT physical plan admission", { timeout: 60_000 }, () => {
    it.each([
        [
            "generated column",
            "CREATE TABLE target (id TEXT PRIMARY KEY, title TEXT DEFAULT 'draft', derived TEXT GENERATED ALWAYS AS (upper(title)) STORED)",
        ],
        ["additional UNIQUE", "CREATE TABLE target (id TEXT PRIMARY KEY, title TEXT UNIQUE NOT NULL DEFAULT 'draft')"],
        ["non-id primary key", "CREATE TABLE target (id TEXT, title TEXT PRIMARY KEY DEFAULT 'draft')"],
        [
            "composite non-id primary key",
            "CREATE TABLE target (id TEXT, title TEXT DEFAULT 'draft', code TEXT DEFAULT 'x', PRIMARY KEY (title, code))",
        ],
        [
            "composite UNIQUE",
            "CREATE TABLE target (id TEXT PRIMARY KEY, title TEXT DEFAULT 'draft', code TEXT DEFAULT 'x', UNIQUE (title, code))",
        ],
    ])("refuses %s before any source mutation or history effect", async (kind, schema) => {
        const run = await fixture(schema);
        try {
            if (kind !== "generated column") {
                const receipt = await run.provider.applyWrite({
                    op: "INSERT",
                    values: { title: "draft", ...(kind.startsWith("composite") ? { code: "x" } : {}) },
                });
                expect(receipt).toEqual({ insertedRowId: expect.any(String) });
                expect(run.target.data.size).toBe(1);
                expect(await run.sqlRows()).toEqual([{
                    id: receipt!.insertedRowId,
                    title: "draft",
                    ...(kind.startsWith("composite") ? { code: "x" } : {}),
                }]);
            }
            const before = await run.snapshot();
            expect(before.errors).toEqual([]);
            expect(before.grid).not.toHaveProperty("sourceTableId");
            expect(before.grid).not.toHaveProperty("insertTargetTableId");
            let mutations = 0;
            run.target.data.observeDeep(() => mutations++);
            const outcome = await run.controller.submit();
            expect({ outcome, mutations, after: await run.snapshot() }).toEqual({
                outcome: {
                    status: "refused",
                    mode: "invalid-record",
                    message: "The Table has no supported default insertion plan",
                },
                mutations: 0,
                after: before,
            });
        } finally {
            run.close();
        }
    });

    it.each([
        {
            label: "TEXT id primary key",
            schema: "CREATE TABLE target (id TEXT PRIMARY KEY, title TEXT NOT NULL DEFAULT 'draft')",
            seed: false,
        },
        {
            label: "UUID id primary key",
            schema: "CREATE TABLE target (id UUID PRIMARY KEY, title TEXT NOT NULL DEFAULT 'draft')",
            seed: false,
        },
        {
            label: "no primary key",
            schema: "CREATE TABLE target (id TEXT, title TEXT NOT NULL DEFAULT 'draft')",
            seed: false,
        },
        {
            label: "composite primary key containing id",
            schema: "CREATE TABLE target (id TEXT, title TEXT DEFAULT 'draft', PRIMARY KEY (id, title))",
            seed: true,
        },
    ])("retains valid filtered insertion and history for $label", async ({ schema, seed }) => {
        const run = await fixture(schema, true);
        try {
            if (seed) {
                const receipt = await run.provider.applyWrite({ op: "INSERT", values: { title: "draft" } });
                expect(receipt).toEqual({ insertedRowId: expect.any(String) });
                expect(run.target.data.toJSON()).toEqual({
                    [receipt!.insertedRowId]: { id: receipt!.insertedRowId, title: "draft" },
                });
                expect(await run.sqlRows()).toEqual([{ id: receipt!.insertedRowId, title: "draft" }]);
                expect((await run.snapshot()).errors).toEqual([]);
            }
            const before = await run.snapshot();
            let mutations = 0;
            run.target.data.observeDeep(() => mutations++);
            const outcome = await run.controller.submit();
            expect(outcome).toEqual({
                status: "inserted",
                targetId: run.target.tableId,
                targetSqlName: "target",
                rowId: expect.any(String),
                visibility: "outside",
            });
            if (outcome.status !== "inserted") throw new Error("Expected source insertion");
            expect(mutations).toBe(1);
            expect(run.target.data.toJSON()).toEqual({
                ...before.records,
                [outcome.rowId!]: { id: outcome.rowId, title: "draft" },
            });
            const expected = [...before.sql, { id: outcome.rowId, title: "draft" }].sort((a, b) =>
                String(a.id).localeCompare(String(b.id))
            );
            expect(await run.sqlRows()).toEqual(expected);
            const after = await run.snapshot();
            expect(after.errors).toEqual([]);
            expect(after.undo).toBe(before.undo + 1);
            expect(after.grid).toEqual(before.grid);
            expect(after.other).toEqual(before.other);
            await globalUndoRouter.undo();
            expect(run.target.data.toJSON()).toEqual(before.records);
            await expect.poll(run.sqlRows).toEqual(before.sql);
            await globalUndoRouter.redo();
            expect(run.target.data.toJSON()).toEqual({
                ...before.records,
                [outcome.rowId!]: { id: outcome.rowId, title: "draft" },
            });
            await expect.poll(run.sqlRows).toEqual(expected);
            expect((await run.snapshot()).errors).toEqual([]);
        } finally {
            run.close();
        }
    });
});
