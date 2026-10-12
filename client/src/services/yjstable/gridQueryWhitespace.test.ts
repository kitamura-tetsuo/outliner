import { afterAll, afterEach, describe, expect, it } from "vitest";
import * as Y from "yjs";
import { createGrid, getGridHandles, getGridQuery, setGridQuery } from "./gridDocs";
import { GridQueryRunner } from "./gridQueryRunner";
import { resetPgliteForTests } from "./pgliteService";
import { analyzeQueryEditability, resolveBareIdMutationAuthority } from "./queryAnalysis";
import { parseCreateTable } from "./schemaIntrospection";
import { addRecord, createTable, getTableHandles, setRecordValue, setSchemaText, type TableHandles } from "./tableDocs";
import {
    createTableEngineSession,
    resetTableEngineForTests,
    type TableDocConnector,
    waitForTableEngineIdle,
} from "./tableEngine";
import { isCurrentExecutionForQuery, type TableQueryExecution } from "./tableQueryRunner";
import type { TableQueryResult } from "./tableSyncAdapter";

/** Unit-test connector: the subdoc is already "synced" locally. */
const localConnector: TableDocConnector = async () => ({
    waitForInitialSync: async () => ({ synced: true }),
    dispose: () => {},
});

/** Two Tables with identical columns and one overlapping record id, different titles. */
function seedOverlappingTables(projectId: string) {
    const projectDoc = new Y.Doc({ guid: projectId });
    const tableA = createTable(projectDoc, "Table A", "tasks_a");
    const tableB = createTable(projectDoc, "Table B", "tasks_b");
    const handlesA = getTableHandles(projectDoc, tableA)!;
    const handlesB = getTableHandles(projectDoc, tableB)!;
    setSchemaText(handlesA, "CREATE TABLE tasks_a (id TEXT PRIMARY KEY, title TEXT)");
    setSchemaText(handlesB, "CREATE TABLE tasks_b (id TEXT PRIMARY KEY, title TEXT)");
    addRecord(handlesA, { title: "Value in A" }, "r1");
    addRecord(handlesB, { title: "Value from B" }, "r1");
    return { projectDoc, tableA, tableB, handlesA, handlesB };
}

function recordTitle(handles: Pick<TableHandles, "data">, recordId: string): unknown {
    return handles.data.get(recordId)?.get("title");
}

afterEach(async () => {
    await resetTableEngineForTests();
});

afterAll(async () => {
    await resetPgliteForTests();
});

describe("whitespace-tolerant grid execution currency (issue #5525)", { timeout: 60000 }, () => {
    it("keeps a padded saved SELECT current without rewriting it, targeted at its source Table", async () => {
        const projectId = "proj-whitespace-currency";
        const { projectDoc, tableA, handlesA, handlesB } = seedOverlappingTables(projectId);
        const base = "SELECT id, title FROM tasks_a";
        const gridId = createGrid(projectDoc, tableA, { name: "Grid", query: base });
        const grid = getGridHandles(projectDoc, gridId)!;
        const schema = await parseCreateTable("CREATE TABLE tasks_a (id TEXT PRIMARY KEY, title TEXT)");

        const session = createTableEngineSession({ projectDoc, projectId, connect: localConnector });
        try {
            const acquired = await session.acquire(tableA);
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
                // Commit through the production writer, exactly as the Query editor does.
                const padded = `${base} `;
                setGridQuery(grid, padded);
                expect(getGridQuery(grid)).toBe(padded);

                const result = await runner.runQueryNow();
                expect(result?.rows.map(row => row.id)).toEqual(["r1"]);
                // The producer records the trimmed text it actually executed.
                expect(lastExecution?.status).toBe("completed");
                expect(lastExecution?.query).toBe(base);
                // The view's currency check tolerates the discarded padding.
                expect(isCurrentExecutionForQuery(lastExecution, getGridQuery(grid))).toBe(true);
                // The persisted text is never rewritten as a side effect.
                expect(getGridQuery(grid)).toBe(padded);

                const authority = resolveBareIdMutationAuthority(
                    lastExecution!.query,
                    "tasks_a",
                    schema,
                    lastResult.columns,
                );
                expect(authority.status).toBe("compatible");
                expect(authority.editableColumns.has("title")).toBe(true);
                // The TableGrid-level decision stays editable for the padded text.
                const editability = analyzeQueryEditability(padded, schema, lastResult.columns, authority);
                expect(editability.editable).toBe(true);

                // The authorized write lands only on the proven source record.
                setRecordValue(handlesA, "r1", "title", "Edited in A");
                expect(recordTitle(handlesA, "r1")).toBe("Edited in A");
                expect(recordTitle(handlesB, "r1")).toBe("Value from B");
            } finally {
                runner.dispose();
            }
        } finally {
            session.dispose();
            await waitForTableEngineIdle();
        }
    });

    it("tolerates only outer whitespace, never different SQL bodies", async () => {
        const projectId = "proj-whitespace-outer-only";
        const { projectDoc, tableA } = seedOverlappingTables(projectId);
        const base = "SELECT id, title FROM tasks_a";
        const gridId = createGrid(projectDoc, tableA, { name: "Grid", query: base });
        const grid = getGridHandles(projectDoc, gridId)!;

        const session = createTableEngineSession({ projectDoc, projectId, connect: localConnector });
        try {
            const acquired = await session.acquire(tableA);
            const runner = new GridQueryRunner({ grid, sourceAdapter: acquired!.adapter });
            let lastExecution: TableQueryExecution | undefined;
            runner.subscribe({ onResult: (_result, execution) => (lastExecution = execution) });
            try {
                for (const padded of [`  ${base}`, `${base}\t`, `\n\t${base}\t\n`]) {
                    setGridQuery(grid, padded);
                    await runner.runQueryNow();
                    expect(lastExecution?.status).toBe("completed");
                    expect(isCurrentExecutionForQuery(lastExecution, getGridQuery(grid))).toBe(true);
                    expect(getGridQuery(grid)).toBe(padded);
                }
                // Internal whitespace, comments, and literals are significant.
                expect(isCurrentExecutionForQuery(lastExecution, "SELECT id,  title FROM tasks_a")).toBe(false);
                expect(isCurrentExecutionForQuery(lastExecution, `${base} -- note`)).toBe(false);
                expect(
                    isCurrentExecutionForQuery(lastExecution, `${base} WHERE title = ' padded '`),
                ).toBe(false);
                expect(isCurrentExecutionForQuery(lastExecution, "SELECT id, title FROM tasks_b")).toBe(false);
            } finally {
                runner.dispose();
            }
        } finally {
            session.dispose();
            await waitForTableEngineIdle();
        }
    });

    it("keeps non-current and mismatched provenance non-writable despite padding", async () => {
        const projectId = "proj-whitespace-gates";
        const { projectDoc, tableA, tableB, handlesA, handlesB } = seedOverlappingTables(projectId);
        const base = "SELECT id, title FROM tasks_a";
        const gridId = createGrid(projectDoc, tableA, { name: "Grid", query: base });
        const grid = getGridHandles(projectDoc, gridId)!;
        const schema = await parseCreateTable("CREATE TABLE tasks_a (id TEXT PRIMARY KEY, title TEXT)");

        const session = createTableEngineSession({ projectDoc, projectId, connect: localConnector });
        try {
            const acquiredA = await session.acquire(tableA);
            await session.acquire(tableB);
            const runner = new GridQueryRunner({ grid, sourceAdapter: acquiredA!.adapter });
            let lastResult: TableQueryResult = { columns: [], rows: [] };
            let lastExecution: TableQueryExecution | undefined;
            runner.subscribe({
                onResult: (result, execution) => {
                    lastResult = result;
                    lastExecution = execution;
                },
            });
            try {
                expect(isCurrentExecutionForQuery(undefined, base)).toBe(false);

                // An empty query is skipped, never current.
                const emptyGridId = createGrid(projectDoc, tableA, { name: "Empty" });
                const emptyRunner = new GridQueryRunner({
                    grid: getGridHandles(projectDoc, emptyGridId)!,
                    sourceAdapter: acquiredA!.adapter,
                });
                let emptyExecution: TableQueryExecution | undefined;
                const unsubscribeEmpty = emptyRunner.subscribe({
                    onResult: (_result, execution) => (emptyExecution = execution),
                });
                try {
                    await emptyRunner.runQueryNow();
                    expect(emptyExecution?.status).toBe("skipped");
                    expect(isCurrentExecutionForQuery(emptyExecution, "")).toBe(false);
                } finally {
                    unsubscribeEmpty();
                    emptyRunner.dispose();
                }

                await runner.runQueryNow();
                const executionForA = lastExecution!;
                expect(executionForA.status).toBe("completed");

                // A stale execution for A is not current for a rewritten query B.
                const queryB = "SELECT id, title FROM tasks_b ";
                expect(isCurrentExecutionForQuery(executionForA, queryB)).toBe(false);

                // After B completes, padding does not rescue the source mismatch.
                setGridQuery(grid, queryB);
                await runner.runQueryNow();
                expect(lastExecution?.status).toBe("completed");
                expect(isCurrentExecutionForQuery(lastExecution, getGridQuery(grid))).toBe(true);
                const mismatch = resolveBareIdMutationAuthority(
                    lastExecution!.query,
                    "tasks_a",
                    schema,
                    lastResult.columns,
                );
                expect(mismatch.status).toBe("source-mismatch");
                expect(
                    analyzeQueryEditability(queryB, schema, lastResult.columns, mismatch).editable,
                ).toBe(false);

                // An unsupported construct stays read-only with or without padding.
                const aggregate = "SELECT COUNT(*) AS n FROM tasks_a ";
                setGridQuery(grid, aggregate);
                await runner.runQueryNow();
                expect(isCurrentExecutionForQuery(lastExecution, getGridQuery(grid))).toBe(true);
                const unsupported = resolveBareIdMutationAuthority(
                    lastExecution!.query,
                    "tasks_a",
                    schema,
                    lastResult.columns,
                );
                expect(unsupported.status).toBe("unavailable");
                expect(
                    analyzeQueryEditability(aggregate, schema, lastResult.columns, unsupported).editable,
                ).toBe(false);

                // Nothing was written while authority was absent or mismatched.
                expect(recordTitle(handlesA, "r1")).toBe("Value in A");
                expect(recordTitle(handlesB, "r1")).toBe("Value from B");
            } finally {
                runner.dispose();
            }
        } finally {
            session.dispose();
            await waitForTableEngineIdle();
        }
    });
});
