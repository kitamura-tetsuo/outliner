// Comma-join mutation-variant coverage (issue #5547): every remaining
// bare-id write path is refused for a comma-joined outer FROM list when
// authority comes from the real query-runner/PGlite path — including a
// comma hidden behind a nested block comment, checkbox/select writes,
// rectangular paste (even a plan validated while writable), and a deletion
// planned before the comma query completed. A writable single-Table control
// proves the refusals are about provenance, not column types.

import { afterAll, afterEach, describe, expect, it } from "vitest";
import * as Y from "yjs";
import { commitGridPaste, planGridPaste } from "./gridClipboard";
import {
    createGrid,
    getGridHandles,
    getGridQuery,
    getGridSourceTableId,
    type GridHandles,
    setGridQuery,
} from "./gridDocs";
import { GridQueryRunner } from "./gridQueryRunner";
import { GridSelection } from "./gridSelection";
import {
    applyValueToSelection,
    clearSelectionToNull,
    type GridCommandContext,
    type GridCommandRowTarget,
    planGridDeleteCommand,
    removeRowTargets,
} from "./gridSelectionCommands";
import { resetPgliteForTests } from "./pgliteService";
import { analyzeQueryEditability, resolveBareIdMutationAuthority } from "./queryAnalysis";
import { parseCreateTable } from "./schemaIntrospection";
import { addRecord, createTable, getTableHandles, type TableHandles } from "./tableDocs";
import {
    type AcquiredTable,
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

const SCHEMA_SQL = "CREATE TABLE tasks_a (id TEXT PRIMARY KEY, title TEXT, done BOOLEAN, status TEXT)";

/** Two Tables with identical columns and one overlapping record id. B holds two records. */
function seedTables(projectId: string) {
    const projectDoc = new Y.Doc({ guid: projectId });
    const tableA = createTable(projectDoc, "Table A", "tasks_a");
    const tableB = createTable(projectDoc, "Table B", "tasks_b");
    const handlesA = getTableHandles(projectDoc, tableA)!;
    const handlesB = getTableHandles(projectDoc, tableB)!;
    setSchemaTextOf(handlesA, SCHEMA_SQL);
    setSchemaTextOf(handlesB, "CREATE TABLE tasks_b (id TEXT PRIMARY KEY, title TEXT, done BOOLEAN, status TEXT)");
    addRecord(handlesA, { title: "Value in A", done: false, status: "Open" }, "r1");
    addRecord(handlesB, { title: "Value from B", done: false, status: "Open" }, "r1");
    addRecord(handlesB, { title: "Second in B", done: true, status: "Done" }, "r2");
    return { projectDoc, tableA, tableB, handlesA, handlesB };
}

function setSchemaTextOf(handles: TableHandles, sql: string) {
    handles.doc.transact(() => {
        handles.schemaText.delete(0, handles.schemaText.length);
        handles.schemaText.insert(0, sql);
    });
}

function snapshotOf(handlesA: TableHandles, handlesB: TableHandles) {
    return {
        titleA: handlesA.data.get("r1")?.get("title"),
        doneA: handlesA.data.get("r1")?.get("done"),
        statusA: handlesA.data.get("r1")?.get("status"),
        titleB1: handlesB.data.get("r1")?.get("title"),
        titleB2: handlesB.data.get("r2")?.get("title"),
        sizeA: handlesA.data.size,
        sizeB: handlesB.data.size,
        undoA: handlesA.undo.undoStack.length,
        undoB: handlesB.undo.undoStack.length,
    };
}

/**
 * Command context derived the way TableGrid derives its own: row identity
 * follows the editability verdict (no `id` addressing when refused), the
 * writable columns are the verdict's own set, value kinds come from the
 * schema column (boolean -> checkbox, options -> select), and bare-id
 * mutation requires an editable `id`-addressed result.
 */
function commandContextFor(
    handles: TableHandles,
    result: TableQueryResult,
    editability: { editable: boolean; editableColumns: Set<string>; rowIdentity?: "id" | "source"; },
    statusOptions: readonly string[],
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
        valueKindOf: (columnId) => {
            if (columnId === "done") return "checkbox";
            if (columnId === "status") return "select";
            return "text";
        },
        checkOptionsOf: (columnId) => columnId === "status" ? statusOptions : undefined,
        isNullableOf: () => true,
        canMutateBareId: () => editability.editable && editability.rowIdentity === "id",
    };
}

/** Run one saved query through the real runner and return its completed execution and result. */
async function runSavedQuery(
    grid: GridHandles,
    acquired: AcquiredTable,
    query: string,
): Promise<{ result: TableQueryResult; execution: TableQueryExecution; }> {
    const runner = new GridQueryRunner({ grid, sourceAdapter: acquired.adapter });
    let lastResult: TableQueryResult = { columns: [], rows: [] };
    let lastExecution: TableQueryExecution | undefined;
    runner.subscribe({
        onResult: (result, execution) => {
            lastResult = result;
            lastExecution = execution;
        },
    });
    try {
        setGridQuery(grid, query);
        await runner.runQueryNow();
        if (lastExecution?.status !== "completed") throw new Error(`query did not complete: ${query}`);
        return { result: lastResult, execution: lastExecution };
    } finally {
        runner.dispose();
    }
}

afterEach(async () => {
    await resetTableEngineForTests();
});

afterAll(async () => {
    await resetPgliteForTests();
});

describe("comma-join mutation variants (issue #5547)", { timeout: 90000 }, () => {
    it("refuses every bare-id write for a comma join hidden behind a nested block comment", async () => {
        const projectId = "proj-comma-join-nested-comment";
        const { projectDoc, tableA, tableB, handlesA, handlesB } = seedTables(projectId);
        const schema = await parseCreateTable(SCHEMA_SQL);
        const gridId = createGrid(projectDoc, tableA, { name: "Grid", query: "SELECT id, title FROM tasks_a" });
        const grid = getGridHandles(projectDoc, gridId)!;

        const session = createTableEngineSession({ projectDoc, projectId, connect: localConnector });
        try {
            const acquired = await session.acquire(tableA);
            await session.acquire(tableB);
            // PostgreSQL reads the nested block comment as one comment, so
            // the comma after its second terminator still joins tasks_b.
            const query =
                "SELECT a.id, a.title FROM tasks_a AS a /* outer /* inner */ WHERE ignored */ , tasks_b AS b LIMIT 1";
            const { result, execution } = await runSavedQuery(grid, acquired!, query);
            expect(getGridQuery(grid)).toBe(query);
            // One row via LIMIT proves nothing about provenance: it stays refused.
            expect(result.rows).toHaveLength(1);

            const authority = resolveBareIdMutationAuthority(
                execution.query,
                "tasks_a",
                schema,
                result.columns,
            );
            expect(authority.status).toBe("unavailable");
            expect(authority.reason).toMatch(/multiple sources|several tables/);
            const editability = analyzeQueryEditability(getGridQuery(grid), schema, result.columns, authority);
            expect(editability.editable).toBe(false);

            const before = snapshotOf(handlesA, handlesB);
            const ctx = commandContextFor(handlesA, result, editability, []);
            const titleSelection = new GridSelection();
            titleSelection.select({ rowId: "row-0", columnId: "title" });
            expect(applyValueToSelection(titleSelection, ctx, "Hacked").applied).toBe(false);
            expect(clearSelectionToNull(titleSelection, ctx).applied).toBe(false);
            expect(planGridPaste(titleSelection, ctx, ["row-0"], "Hacked").kind).not.toBe("apply");
            removeRowTargets(ctx, [...ctx.rowTargets.values()]);
            expect(snapshotOf(handlesA, handlesB)).toEqual(before);
            expect(getGridQuery(grid)).toBe(query);
            expect(getGridSourceTableId(projectDoc, gridId)).toBe(tableA);
        } finally {
            session.dispose();
            await waitForTableEngineIdle();
        }
    });

    it("refuses checkbox/select/clear/paste/delete on a refused comma result", async () => {
        const projectId = "proj-comma-join-variants";
        const { projectDoc, tableA, tableB, handlesA, handlesB } = seedTables(projectId);
        const schema = await parseCreateTable(SCHEMA_SQL);
        const statusColumn = schema.columns.find((column) => column.name === "status")!;
        statusColumn.checkOptions = ["Open", "Done"];
        const gridId = createGrid(projectDoc, tableA, { name: "Grid", query: "SELECT id, title FROM tasks_a" });
        const grid = getGridHandles(projectDoc, gridId)!;

        const session = createTableEngineSession({ projectDoc, projectId, connect: localConnector });
        try {
            const acquired = await session.acquire(tableA);
            await session.acquire(tableB);
            const query = "SELECT a.id, a.title, a.done, a.status FROM tasks_a AS a, tasks_b AS b";
            const { result, execution } = await runSavedQuery(grid, acquired!, query);
            expect(result.rows).toHaveLength(2);

            const authority = resolveBareIdMutationAuthority(
                execution.query,
                "tasks_a",
                schema,
                result.columns,
            );
            expect(authority.status).toBe("unavailable");
            const editability = analyzeQueryEditability(getGridQuery(grid), schema, result.columns, authority);
            expect(editability.editable).toBe(false);

            const before = snapshotOf(handlesA, handlesB);
            const ctx = commandContextFor(handlesA, result, editability, ["Open", "Done"]);
            const rowOrder = [...ctx.rowTargets.keys()];

            // Checkbox and select writes through the production bulk command.
            const doneSelection = new GridSelection();
            doneSelection.select({ rowId: "row-0", columnId: "done" });
            expect(applyValueToSelection(doneSelection, ctx, true).applied).toBe(false);
            const statusSelection = new GridSelection();
            statusSelection.select({ rowId: "row-0", columnId: "status" });
            expect(applyValueToSelection(statusSelection, ctx, "Done").applied).toBe(false);
            expect(clearSelectionToNull(statusSelection, ctx).applied).toBe(false);

            // Rectangular paste finds no writable cell on the refused result.
            const pasteSelection = new GridSelection();
            pasteSelection.select({ rowId: "row-0", columnId: "title" });
            const pastePlan = planGridPaste(pasteSelection, ctx, rowOrder, "Hacked");
            expect(pastePlan.kind).toBe("no-writable-cells");

            // Single and bulk row deletion are refused.
            const rowsSelection = new GridSelection();
            rowsSelection.selectRow("row-0", rowOrder);
            const deletePlan = planGridDeleteCommand(rowsSelection, ctx);
            expect(deletePlan.kind).toBe("remove-rows");
            if (deletePlan.kind === "remove-rows") expect(deletePlan.targets).toEqual([]);
            removeRowTargets(ctx, [...ctx.rowTargets.values()]);
            const selectAll = new GridSelection();
            selectAll.selectAll();
            const allPlan = planGridDeleteCommand(selectAll, ctx);
            if (allPlan.kind === "clear-cells") expect(allPlan.outcome.applied).toBe(false);

            expect(snapshotOf(handlesA, handlesB)).toEqual(before);
            expect(getGridQuery(grid)).toBe(query);
        } finally {
            session.dispose();
            await waitForTableEngineIdle();
        }
    });

    it("refuses a paste and a deletion pending from before the comma query completed", async () => {
        const projectId = "proj-comma-join-pending";
        const { projectDoc, tableA, tableB, handlesA, handlesB } = seedTables(projectId);
        const schema = await parseCreateTable(SCHEMA_SQL);
        const gridId = createGrid(projectDoc, tableA, { name: "Grid", query: "SELECT id, title FROM tasks_a" });
        const grid = getGridHandles(projectDoc, gridId)!;

        const session = createTableEngineSession({ projectDoc, projectId, connect: localConnector });
        try {
            const acquired = await session.acquire(tableA);
            await session.acquire(tableB);
            // Writable single-Table execution first: plan a paste and a row
            // deletion against it, exactly as an open editor or a pending
            // confirmation would hold them.
            const base = await runSavedQuery(grid, acquired!, "SELECT id, title FROM tasks_a");
            const baseAuthority = resolveBareIdMutationAuthority(
                base.execution.query,
                "tasks_a",
                schema,
                base.result.columns,
            );
            expect(baseAuthority.status).toBe("compatible");
            const baseEditability = analyzeQueryEditability(
                getGridQuery(grid),
                schema,
                base.result.columns,
                baseAuthority,
            );
            expect(baseEditability.editable).toBe(true);
            const baseCtx = commandContextFor(handlesA, base.result, baseEditability, []);
            const baseRowOrder = [...baseCtx.rowTargets.keys()];
            const pasteSelection = new GridSelection();
            pasteSelection.select({ rowId: "row-0", columnId: "title" });
            const pendingPaste = planGridPaste(pasteSelection, baseCtx, baseRowOrder, "Stale paste");
            expect(pendingPaste.kind).toBe("apply");
            const deleteSelection = new GridSelection();
            deleteSelection.selectRow("row-0", baseRowOrder);
            const pendingDelete = planGridDeleteCommand(deleteSelection, baseCtx);
            expect(pendingDelete.kind).toBe("remove-rows");
            if (pendingDelete.kind !== "remove-rows") throw new Error("expected a pending row removal");

            // The saved query becomes the comma join while those actions are
            // still uncommitted; the completed comma result revokes authority.
            const commaQuery = "SELECT a.id, a.title FROM tasks_a AS a, tasks_b AS b";
            const { result, execution } = await runSavedQuery(grid, acquired!, commaQuery);
            const authority = resolveBareIdMutationAuthority(
                execution.query,
                "tasks_a",
                schema,
                result.columns,
            );
            expect(authority.status).toBe("unavailable");
            const editability = analyzeQueryEditability(getGridQuery(grid), schema, result.columns, authority);
            expect(editability.editable).toBe(false);
            const commaCtx = commandContextFor(handlesA, result, editability, []);

            // Committing the stale plans against current authority writes nothing.
            const before = snapshotOf(handlesA, handlesB);
            if (pendingPaste.kind === "apply") commitGridPaste(commaCtx, pendingPaste.writes);
            removeRowTargets(commaCtx, pendingDelete.targets);
            expect(snapshotOf(handlesA, handlesB)).toEqual(before);
            expect(getGridQuery(grid)).toBe(commaQuery);
            expect(getGridSourceTableId(projectDoc, gridId)).toBe(tableA);
        } finally {
            session.dispose();
            await waitForTableEngineIdle();
        }
    });

    it("keeps a writable single-Table query with checkbox/select columns working", async () => {
        const projectId = "proj-comma-join-positive";
        const { projectDoc, tableA, tableB, handlesA, handlesB } = seedTables(projectId);
        const schema = await parseCreateTable(SCHEMA_SQL);
        const gridId = createGrid(projectDoc, tableA, { name: "Grid", query: "SELECT id, title FROM tasks_a" });
        const grid = getGridHandles(projectDoc, gridId)!;

        const session = createTableEngineSession({ projectDoc, projectId, connect: localConnector });
        try {
            const acquired = await session.acquire(tableA);
            await session.acquire(tableB);
            const query = "SELECT id, title, done, status FROM tasks_a ORDER BY title, id LIMIT 10 OFFSET 0";
            const { result, execution } = await runSavedQuery(grid, acquired!, query);
            const authority = resolveBareIdMutationAuthority(
                execution.query,
                "tasks_a",
                schema,
                result.columns,
            );
            expect(authority.status).toBe("compatible");
            const editability = analyzeQueryEditability(getGridQuery(grid), schema, result.columns, authority);
            expect(editability.editable).toBe(true);

            const undoBefore = snapshotOf(handlesA, handlesB);
            const ctx = commandContextFor(handlesA, result, editability, ["Open", "Done"]);
            const doneSelection = new GridSelection();
            doneSelection.select({ rowId: "row-0", columnId: "done" });
            expect(applyValueToSelection(doneSelection, ctx, true)).toEqual({ applied: true, count: 1 });
            expect(handlesA.data.get("r1")?.get("done")).toBe(true);
            expect(handlesB.data.get("r1")?.get("done")).toBe(false);
            expect(handlesA.undo.undoStack.length).toBeGreaterThan(undoBefore.undoA);
            handlesA.undo.undo();
            expect(handlesA.data.get("r1")?.get("done")).toBe(false);
            expect(getGridQuery(grid)).toBe(query);
        } finally {
            session.dispose();
            await waitForTableEngineIdle();
        }
    });
});
