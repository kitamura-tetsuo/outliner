// Comma-joined outer FROM lists are cross joins: a saved Grid bound to one
// Table must show the combined result but refuse every bare-id write through
// the real query-runner/PGlite path (issue #5547). Authority and editability
// are derived from the actual completed execution, and mutation attempts go
// through the production selection-command boundaries with a TableGrid-shaped
// context, observing the underlying Tables and their data Undo stacks.

import { afterAll, afterEach, describe, expect, it } from "vitest";
import * as Y from "yjs";
import { createGrid, getGridHandles, getGridQuery, setGridQuery } from "./gridDocs";
import { GridQueryRunner } from "./gridQueryRunner";
import { GridSelection } from "./gridSelection";
import {
    applyValueToSelection,
    clearSelectionToNull,
    type GridCommandContext,
    type GridCommandRowTarget,
    removeRowTargets,
} from "./gridSelectionCommands";
import { resetPgliteForTests } from "./pgliteService";
import { analyzeQueryEditability, resolveBareIdMutationAuthority } from "./queryAnalysis";
import { parseCreateTable, type ParsedTableSchema } from "./schemaIntrospection";
import { addRecord, createTable, getTableHandles, type TableHandles } from "./tableDocs";
import {
    createTableEngineSession,
    resetTableEngineForTests,
    type TableDocConnector,
    waitForTableEngineIdle,
} from "./tableEngine";
import type { TableQueryExecution } from "./tableQueryRunner";
import type { TableQueryResult } from "./tableSyncAdapter";

/** Unit-test connector: the subdoc is already "synced" locally. */
const localConnector: TableDocConnector = async () => ({
    waitForInitialSync: async () => ({ synced: true }),
    dispose: () => {},
});

/** Two Tables with identical columns and one overlapping record id. B holds two records. */
function seedTables(projectId: string) {
    const projectDoc = new Y.Doc({ guid: projectId });
    const tableA = createTable(projectDoc, "Table A", "tasks_a");
    const tableB = createTable(projectDoc, "Table B", "tasks_b");
    const handlesA = getTableHandles(projectDoc, tableA)!;
    const handlesB = getTableHandles(projectDoc, tableB)!;
    setSchemaTextOf(handlesA, "CREATE TABLE tasks_a (id TEXT PRIMARY KEY, title TEXT)");
    setSchemaTextOf(handlesB, "CREATE TABLE tasks_b (id TEXT PRIMARY KEY, title TEXT)");
    addRecord(handlesA, { title: "Value in A" }, "r1");
    addRecord(handlesB, { title: "Value from B" }, "r1");
    addRecord(handlesB, { title: "Second in B" }, "r2");
    return { projectDoc, tableA, tableB, handlesA, handlesB };
}

function setSchemaTextOf(handles: TableHandles, sql: string) {
    handles.doc.transact(() => {
        handles.schemaText.delete(0, handles.schemaText.length);
        handles.schemaText.insert(0, sql);
    });
}

function titleOf(handles: Pick<TableHandles, "data">, recordId: string): unknown {
    return handles.data.get(recordId)?.get("title");
}

function undoDepth(handles: Pick<TableHandles, "undo">): number {
    return handles.undo.undoStack.length;
}

/**
 * Build the command context exactly as TableGrid derives it: row identity
 * follows the editability verdict (no `id` addressing when refused), the
 * writable columns are the verdict's own set, and bare-id mutation requires
 * an editable `id`-addressed result.
 */
function commandContextFor(
    handles: TableHandles,
    result: TableQueryResult,
    editability: { editable: boolean; editableColumns: Set<string>; rowIdentity?: "id" | "source"; },
): GridCommandContext {
    const rowTargets = new Map<string, GridCommandRowTarget>();
    result.rows.forEach((row, index) => {
        const recordId = editability.rowIdentity === "id" && typeof row.id === "string"
            ? row.id
            : undefined;
        rowTargets.set(`row-${index}`, { row, recordId });
    });
    return {
        handles,
        session: { resolveRelation: async () => undefined },
        rowTargets,
        columnOrder: result.columns,
        editableColumns: editability.editableColumns,
        valueKindOf: () => "text",
        checkOptionsOf: () => undefined,
        isNullableOf: () => true,
        canMutateBareId: () => editability.editable && editability.rowIdentity === "id",
    };
}

function selectFirstCell(columnId: string): GridSelection {
    const selection = new GridSelection();
    selection.select({ rowId: "row-0", columnId });
    return selection;
}

afterEach(async () => {
    await resetTableEngineForTests();
});

afterAll(async () => {
    await resetPgliteForTests();
});

describe("comma-joined Grid mutation authority (issue #5547)", { timeout: 90000 }, () => {
    it("shows a real cross-join result but refuses every bare-id write", async () => {
        const projectId = "proj-comma-join-refusal";
        const { projectDoc, tableA, tableB, handlesA, handlesB } = seedTables(projectId);
        const schema = await parseCreateTable("CREATE TABLE tasks_a (id TEXT PRIMARY KEY, title TEXT)");
        const gridId = createGrid(projectDoc, tableA, { name: "Grid", query: "SELECT id, title FROM tasks_a" });
        const grid = getGridHandles(projectDoc, gridId)!;

        const session = createTableEngineSession({ projectDoc, projectId, connect: localConnector });
        try {
            const acquired = await session.acquire(tableA);
            await session.acquire(tableB);
            const runner = new GridQueryRunner({ grid, sourceAdapter: acquired!.adapter });
            let lastResult: TableQueryResult = { columns: [], rows: [] };
            let lastExecution: TableQueryExecution | undefined;
            runner.subscribe({
                onResult: (result, execution) => {
                    lastResult = result;
                    lastExecution = execution;
                },
            });
            try {
                // Saved through the production writer, exactly as the Query editor does.
                const query = "SELECT a.id, a.title FROM tasks_a AS a, tasks_b AS b";
                setGridQuery(grid, query);
                await runner.runQueryNow();
                expect(lastExecution?.status).toBe("completed");
                expect(getGridQuery(grid)).toBe(query);

                // The displayed result really is the combined cross join.
                expect(lastResult.rows).toHaveLength(2);
                expect(lastResult.rows.map(row => row.id)).toEqual(["r1", "r1"]);

                const authority = resolveBareIdMutationAuthority(
                    lastExecution!.query,
                    "tasks_a",
                    schema,
                    lastResult.columns,
                );
                expect(authority.status).toBe("unavailable");
                expect(authority.reason).toMatch(/multiple sources|several tables/);
                const editability = analyzeQueryEditability(
                    getGridQuery(grid),
                    schema,
                    lastResult.columns,
                    authority,
                );
                expect(editability.editable).toBe(false);

                const undoA = undoDepth(handlesA);
                const undoB = undoDepth(handlesB);
                const ctx = commandContextFor(handlesA, lastResult, editability);

                // Cell commit, bulk set, clear, and row deletion are all refused.
                const bulk = applyValueToSelection(selectFirstCell("title"), ctx, "Hacked");
                expect(bulk.applied).toBe(false);
                const cleared = clearSelectionToNull(selectFirstCell("title"), ctx);
                expect(cleared.applied).toBe(false);
                removeRowTargets(ctx, [...ctx.rowTargets.values()]);
                expect(titleOf(handlesA, "r1")).toBe("Value in A");
                expect(titleOf(handlesB, "r1")).toBe("Value from B");
                expect(titleOf(handlesB, "r2")).toBe("Second in B");
                expect(handlesA.data.has("r1")).toBe(true);
                expect(undoDepth(handlesA)).toBe(undoA);
                expect(undoDepth(handlesB)).toBe(undoB);
                // The saved definition is never rewritten as a side effect.
                expect(getGridQuery(grid)).toBe(query);
            } finally {
                runner.dispose();
            }
        } finally {
            session.dispose();
            await waitForTableEngineIdle();
        }
    });

    it("refuses no-alias, self-join, comment-separated, and one-row variants", async () => {
        const projectId = "proj-comma-join-variants";
        const { projectDoc, tableA, tableB, handlesA } = seedTables(projectId);
        const schema = await parseCreateTable("CREATE TABLE tasks_a (id TEXT PRIMARY KEY, title TEXT)");
        const gridId = createGrid(projectDoc, tableA, { name: "Grid", query: "SELECT id, title FROM tasks_a" });
        const grid = getGridHandles(projectDoc, gridId)!;

        const session = createTableEngineSession({ projectDoc, projectId, connect: localConnector });
        try {
            const acquired = await session.acquire(tableA);
            await session.acquire(tableB);
            const runner = new GridQueryRunner({ grid, sourceAdapter: acquired!.adapter });
            let lastResult: TableQueryResult = { columns: [], rows: [] };
            let lastExecution: TableQueryExecution | undefined;
            runner.subscribe({
                onResult: (result, execution) => {
                    lastResult = result;
                    lastExecution = execution;
                },
            });
            try {
                const variants = [
                    "SELECT tasks_a.id, tasks_a.title FROM tasks_a, tasks_b",
                    "SELECT a.id, a.title FROM tasks_a AS a, tasks_a AS b",
                    "SELECT a.id, a.title FROM tasks_a AS a /* join */ , -- line\n tasks_b AS b",
                    "SELECT a.id, a.title FROM tasks_a AS a, tasks_b AS b LIMIT 1",
                ];
                for (const query of variants) {
                    setGridQuery(grid, query);
                    await runner.runQueryNow();
                    expect(lastExecution?.status, query).toBe("completed");
                    const authority = resolveBareIdMutationAuthority(
                        lastExecution!.query,
                        "tasks_a",
                        schema,
                        lastResult.columns,
                    );
                    expect(authority.status, query).toBe("unavailable");
                    const editability = analyzeQueryEditability(
                        getGridQuery(grid),
                        schema,
                        lastResult.columns,
                        authority,
                    );
                    expect(editability.editable, query).toBe(false);
                    // LIMIT 1 still leaves a combined single row: cardinality is not proof.
                    if (query.includes("LIMIT 1")) expect(lastResult.rows).toHaveLength(1);
                }
                expect(titleOf(handlesA, "r1")).toBe("Value in A");
            } finally {
                runner.dispose();
            }
        } finally {
            session.dispose();
            await waitForTableEngineIdle();
        }
    });

    it("keeps comma-bearing single-table queries writable end to end", async () => {
        const projectId = "proj-comma-join-positive";
        const { projectDoc, tableA, tableB, handlesA, handlesB } = seedTables(projectId);
        const schema: ParsedTableSchema = await parseCreateTable(
            "CREATE TABLE tasks_a (id TEXT PRIMARY KEY, title TEXT)",
        );
        const gridId = createGrid(projectDoc, tableA, { name: "Grid", query: "SELECT id, title FROM tasks_a" });
        const grid = getGridHandles(projectDoc, gridId)!;

        const session = createTableEngineSession({ projectDoc, projectId, connect: localConnector });
        try {
            const acquired = await session.acquire(tableA);
            await session.acquire(tableB);
            const runner = new GridQueryRunner({ grid, sourceAdapter: acquired!.adapter });
            let lastResult: TableQueryResult = { columns: [], rows: [] };
            let lastExecution: TableQueryExecution | undefined;
            runner.subscribe({
                onResult: (result, execution) => {
                    lastResult = result;
                    lastExecution = execution;
                },
            });
            try {
                const query = "SELECT id, title FROM tasks_a ORDER BY title, id LIMIT 10 OFFSET 0";
                setGridQuery(grid, query);
                await runner.runQueryNow();
                expect(lastExecution?.status).toBe("completed");
                const authority = resolveBareIdMutationAuthority(
                    lastExecution!.query,
                    "tasks_a",
                    schema,
                    lastResult.columns,
                );
                expect(authority.status).toBe("compatible");
                expect(authority.editableColumns.has("title")).toBe(true);
                const editability = analyzeQueryEditability(
                    getGridQuery(grid),
                    schema,
                    lastResult.columns,
                    authority,
                );
                expect(editability.editable).toBe(true);

                const undoBefore = undoDepth(handlesA);
                const ctx = commandContextFor(handlesA, lastResult, editability);
                const outcome = applyValueToSelection(selectFirstCell("title"), ctx, "Edited in A");
                expect(outcome).toEqual({ applied: true, count: 1 });
                expect(titleOf(handlesA, "r1")).toBe("Edited in A");
                expect(titleOf(handlesB, "r1")).toBe("Value from B");
                expect(undoDepth(handlesA)).toBeGreaterThan(undoBefore);
                // The write is a real data-Undo step: undoing restores the prior
                // value and redoing reapplies the edit. The SQL is untouched.
                handlesA.undo.undo();
                expect(titleOf(handlesA, "r1")).toBe("Value in A");
                handlesA.undo.redo();
                expect(titleOf(handlesA, "r1")).toBe("Edited in A");
                expect(getGridQuery(grid)).toBe(query);
            } finally {
                runner.dispose();
            }
        } finally {
            session.dispose();
            await waitForTableEngineIdle();
        }
    });
});
