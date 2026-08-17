// Revisiting a grid within the same session: a released relation stays warm,
// so the second visit reuses the adapter, the connection and the last result
// instead of rebuilding all three.

import { afterAll, afterEach, describe, expect, it } from "vitest";
import * as Y from "yjs";
import { resetPgliteForTests, runSelect } from "./pgliteService";
import { projectSchemaName } from "./sqlNames";
import { addRecord, createTable, getTableHandles, setSchemaText, type TableHandles } from "./tableDocs";
import {
    createTableEngineSession,
    resetTableEngineForTests,
    type TableDocConnector,
    waitForTableEngineIdle,
} from "./tableEngine";
import type { TableQueryResult } from "./tableSyncAdapter";

/** Counts what a warm revisit must not do again: connect and sync the subdoc. */
function countingConnector() {
    const counts = { connects: 0, disposes: 0 };
    const connect: TableDocConnector = async () => {
        counts.connects++;
        return {
            waitForInitialSync: async () => ({ synced: true }),
            dispose: () => {
                counts.disposes++;
            },
        };
    };
    return { connect, counts };
}

function seedTable(projectId: string, sqlName = "orders"): { projectDoc: Y.Doc; id: string; handles: TableHandles; } {
    const projectDoc = new Y.Doc({ guid: projectId });
    const id = createTable(projectDoc, sqlName, sqlName);
    const handles = getTableHandles(projectDoc, id)!;
    setSchemaText(handles, `CREATE TABLE ${sqlName} (id TEXT PRIMARY KEY, amount INTEGER)`);
    handles.uiDef.set("query", `SELECT id, amount FROM ${sqlName} ORDER BY id`);
    addRecord(handles, { amount: 100 }, "o1");
    addRecord(handles, { amount: 250 }, "o2");
    return { projectDoc, id, handles };
}

/** Let the adapter's queued record flush reach PGlite. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

afterEach(async () => {
    await resetTableEngineForTests();
});

afterAll(async () => {
    await resetPgliteForTests();
});

// The first test pays PGlite's cold-start cost.
describe("warm relation cache", { timeout: 30000 }, () => {
    it("reuses the adapter of a released table instead of connecting again", async () => {
        const projectId = "proj-warm-reuse";
        const { projectDoc, id } = seedTable(projectId);
        const { connect, counts } = countingConnector();

        const first = createTableEngineSession({ projectDoc, projectId, connect });
        const opened = await first.acquire(id);
        await opened!.adapter.runQueryNow();
        first.dispose();
        await waitForTableEngineIdle();

        const second = createTableEngineSession({ projectDoc, projectId, connect });
        try {
            const reopened = await second.acquire(id);
            expect(reopened!.adapter).toBe(opened!.adapter);
            expect(counts.connects).toBe(1);
            expect(counts.disposes).toBe(0);

            // The reopened view renders from the replayed result, without
            // waiting for a query of its own.
            let replayed: TableQueryResult | undefined;
            reopened!.adapter.subscribe({ onQueryResult: (r) => (replayed = r) });
            expect(replayed?.rows).toEqual([
                { id: "o1", amount: 100 },
                { id: "o2", amount: 250 },
            ]);
        } finally {
            second.dispose();
        }
    });

    it("keeps the materialized relation alive after the last view closed", async () => {
        const projectId = "proj-warm-alive";
        const { projectDoc, id } = seedTable(projectId);
        const session = createTableEngineSession({ projectDoc, projectId, connect: countingConnector().connect });
        await session.acquire(id);
        session.dispose();
        await waitForTableEngineIdle();

        const schema = projectSchemaName(projectId);
        const rows = await runSelect(`SELECT "id" FROM "${schema}"."orders" ORDER BY "id"`);
        expect(rows.rows).toEqual([{ id: "o1" }, { id: "o2" }]);
    });

    it("keeps a warm relation in sync with Yjs changes made while no view is mounted", async () => {
        const projectId = "proj-warm-sync";
        const { projectDoc, id, handles } = seedTable(projectId);
        const { connect, counts } = countingConnector();

        const first = createTableEngineSession({ projectDoc, projectId, connect });
        const opened = await first.acquire(id);
        await opened!.adapter.runQueryNow();
        first.dispose();
        await waitForTableEngineIdle();

        // The adapter's observers are still installed, so a remote change
        // reaches PGlite with no view showing the table.
        addRecord(handles, { amount: 40 }, "o3");
        await settle();

        const second = createTableEngineSession({ projectDoc, projectId, connect });
        try {
            const reopened = await second.acquire(id);
            expect(reopened!.adapter).toBe(opened!.adapter);
            expect(counts.connects).toBe(1);
            const result = await reopened!.adapter.runQueryNow();
            expect(result?.rows).toEqual([
                { id: "o1", amount: 100 },
                { id: "o2", amount: 250 },
                { id: "o3", amount: 40 },
            ]);
        } finally {
            second.dispose();
        }
    });
});
