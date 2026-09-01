import { afterAll, afterEach, describe, expect, it } from "vitest";
import * as Y from "yjs";
import { createGrid, getGridHandles, setGridQuery } from "./gridDocs";
import { GridQueryRunner } from "./gridQueryRunner";
import { resetPgliteForTests } from "./pgliteService";
import { addRecord, createTable, getTableHandles, setSchemaText } from "./tableDocs";
import {
    createTableEngineSession,
    resetTableEngineForTests,
    type TableDocConnector,
    waitForTableEngineIdle,
} from "./tableEngine";
import type { TableQueryResult } from "./tableSyncAdapter";

/** Unit-test connector: the subdoc is already "synced" locally. */
const localConnector: TableDocConnector = async () => ({
    waitForInitialSync: async () => ({ synced: true }),
    dispose: () => {},
});

function seedTasksTable(projectId: string) {
    const projectDoc = new Y.Doc({ guid: projectId });
    const tasksId = createTable(projectDoc, "Tasks", "tasks");
    const handles = getTableHandles(projectDoc, tasksId)!;
    setSchemaText(
        handles,
        "CREATE TABLE tasks (id TEXT PRIMARY KEY, title TEXT, status TEXT, assignee TEXT)",
    );
    addRecord(handles, { title: "Draft", status: "open", assignee: "alice" }, "t1");
    addRecord(handles, { title: "Ship", status: "open", assignee: "bob" }, "t2");
    addRecord(handles, { title: "Done", status: "done", assignee: "alice" }, "t3");
    return { projectDoc, tasksId, handles };
}

/** Give observers/microtasks a tick so any pending debounced work settles. */
function tick(ms = 250): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

afterEach(async () => {
    await resetTableEngineForTests();
});

afterAll(async () => {
    await resetPgliteForTests();
});

describe("one Table, many Grids", { timeout: 30000 }, () => {
    it("executes an unchanged pre-policy Grid with an implicit alias", async () => {
        const projectId = "proj-legacy-grid-alias";
        const { projectDoc, tasksId } = seedTasksTable(projectId);
        const gridId = createGrid(projectDoc, tasksId, {
            name: "Legacy",
            query: "SELECT title AS value FROM tasks ORDER BY id",
        });
        const grid = getGridHandles(projectDoc, gridId)!;
        // Seed the state shape written before the policy was introduced.
        grid.entry.set("query", "SELECT title value FROM tasks ORDER BY id");
        grid.entry.delete("sqlAliasPolicyVersion");

        const session = createTableEngineSession({ projectDoc, projectId, connect: localConnector });
        try {
            const acquired = await session.acquire(tasksId);
            const runner = new GridQueryRunner({ grid, sourceAdapter: acquired!.adapter });
            try {
                const result = await runner.runQueryNow();
                expect(result?.rows.map(row => row.value)).toEqual(["Draft", "Ship", "Done"]);
            } finally {
                runner.dispose();
            }
        } finally {
            session.dispose();
            await waitForTableEngineIdle();
        }
    });

    it("runs two Grids' SELECTs independently against the same source Table", async () => {
        const projectId = "proj-one-table-many-grids";
        const { projectDoc, tasksId } = seedTasksTable(projectId);
        const openGridId = createGrid(projectDoc, tasksId, {
            name: "Open",
            query: "SELECT id, title, status FROM tasks WHERE status = 'open' ORDER BY id",
        });
        const aliceGridId = createGrid(projectDoc, tasksId, {
            name: "Alice",
            query: "SELECT id, title FROM tasks WHERE assignee = 'alice' ORDER BY id",
        });

        const session = createTableEngineSession({ projectDoc, projectId, connect: localConnector });
        try {
            const acquired = await session.acquire(tasksId);
            expect(acquired).toBeDefined();

            const openRunner = new GridQueryRunner({
                grid: getGridHandles(projectDoc, openGridId)!,
                sourceAdapter: acquired!.adapter,
            });
            const aliceRunner = new GridQueryRunner({
                grid: getGridHandles(projectDoc, aliceGridId)!,
                sourceAdapter: acquired!.adapter,
            });
            try {
                openRunner.start();
                aliceRunner.start();

                let openResult: TableQueryResult | undefined;
                let aliceResult: TableQueryResult | undefined;
                openRunner.subscribe({ onResult: (r) => (openResult = r) });
                aliceRunner.subscribe({ onResult: (r) => (aliceResult = r) });

                openResult = await openRunner.runQueryNow();
                aliceResult = await aliceRunner.runQueryNow();

                expect(openResult?.rows.map(r => r.id)).toEqual(["t1", "t2"]);
                expect(aliceResult?.rows.map(r => r.id)).toEqual(["t1", "t3"]);

                // Changing one Grid's query must not disturb the other.
                setGridQuery(
                    getGridHandles(projectDoc, openGridId)!,
                    "SELECT id FROM tasks WHERE status = 'open' AND assignee = 'bob'",
                );
                openResult = await openRunner.runQueryNow();
                expect(openResult?.rows).toEqual([{ id: "t2" }]);
                aliceResult = await aliceRunner.runQueryNow();
                expect(aliceResult?.rows.map(r => r.id)).toEqual(["t1", "t3"]);
            } finally {
                openRunner.dispose();
                aliceRunner.dispose();
            }
        } finally {
            session.dispose();
            await waitForTableEngineIdle();
        }
    });

    it("propagates a Table data edit to every Grid's live result", async () => {
        const projectId = "proj-data-propagation";
        const { projectDoc, tasksId, handles } = seedTasksTable(projectId);
        const aId = createGrid(projectDoc, tasksId, {
            name: "A",
            query: "SELECT COUNT(*)::TEXT AS n FROM tasks",
        });
        const bId = createGrid(projectDoc, tasksId, {
            name: "B",
            query: "SELECT COUNT(*)::TEXT AS n FROM tasks WHERE status = 'open'",
        });

        const session = createTableEngineSession({ projectDoc, projectId, connect: localConnector });
        try {
            const acquired = await session.acquire(tasksId);
            const runnerA = new GridQueryRunner({
                grid: getGridHandles(projectDoc, aId)!,
                sourceAdapter: acquired!.adapter,
            });
            const runnerB = new GridQueryRunner({
                grid: getGridHandles(projectDoc, bId)!,
                sourceAdapter: acquired!.adapter,
            });
            try {
                runnerA.start();
                runnerB.start();
                let a = await runnerA.runQueryNow();
                let b = await runnerB.runQueryNow();
                expect(a?.rows[0].n).toBe("3");
                expect(b?.rows[0].n).toBe("2");

                // Insert a new open task and let the shared sync adapter's
                // onDataApplied propagate through both runners.
                addRecord(handles, { title: "Later", status: "open", assignee: "carol" }, "t4");
                await tick();
                a = await runnerA.runQueryNow();
                b = await runnerB.runQueryNow();
                expect(a?.rows[0].n).toBe("4");
                expect(b?.rows[0].n).toBe("3");
            } finally {
                runnerA.dispose();
                runnerB.dispose();
            }
        } finally {
            session.dispose();
            await waitForTableEngineIdle();
        }
    });
});
