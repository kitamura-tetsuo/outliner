import { afterAll, afterEach, describe, expect, it } from "vitest";
import * as Y from "yjs";
import { createGridMetadataResolver } from "./gridMetadataResolver";
import { resetPgliteForTests } from "./pgliteService";
import { analyzeProjectQueryProvenance } from "./projectQueryProvenance";
import { createProjectSelectSession } from "./projectSelectSession";
import { addRecord, createTable, getTableHandles, setSchemaText } from "./tableDocs";
import { resetTableEngineForTests, type TableDocConnector } from "./tableEngine";

const connect: TableDocConnector = async () => ({
    waitForInitialSync: async () => ({ synced: true }),
    dispose: () => {},
});

afterEach(async () => await resetTableEngineForTests());
afterAll(async () => await resetPgliteForTests());

describe("Grid metadata lifecycle", { timeout: 30_000 }, () => {
    it("preserves typed relation-free and empty result evidence without physical metadata", async () => {
        const doc = new Y.Doc({ guid: "grid-metadata-empty" });
        for (const query of ["SELECT 42::INTEGER AS answer", "SELECT 42::INTEGER AS answer WHERE false"]) {
            const select = createProjectSelectSession({
                projectDoc: doc,
                query,
                connect,
                requireExplicitAliases: false,
            });
            const resolver = createGridMetadataResolver({ projectDoc: doc, connect });
            try {
                const evidence = (await select.runNow())!;
                const result = await resolver.resolve(evidence, analyzeProjectQueryProvenance(evidence), select);
                expect(result).toMatchObject({
                    status: "relation-free",
                    columns: [{ index: 0, name: "answer", typeId: 23 }],
                    physicalColumns: [],
                });
                expect(result.rows).toEqual(query.includes("false") ? [] : [{ answer: 42 }]);
            } finally {
                resolver.dispose();
                select.dispose();
            }
        }
    });

    it("rejects stale schema evidence and resolves renewed execution metadata", async () => {
        const doc = new Y.Doc({ guid: "grid-metadata-refresh" });
        const tableId = createTable(doc, "A", "a");
        const handles = getTableHandles(doc, tableId)!;
        setSchemaText(handles, "CREATE TABLE a (id TEXT PRIMARY KEY, value TEXT)");
        addRecord(handles, { value: "1" }, "a1");
        const select = createProjectSelectSession({
            projectDoc: doc,
            query: "SELECT value FROM a",
            connect,
            requireExplicitAliases: false,
        });
        const resolver = createGridMetadataResolver({ projectDoc: doc, connect });
        try {
            const oldEvidence = (await select.runNow())!;
            const oldProof = analyzeProjectQueryProvenance(oldEvidence);
            setSchemaText(handles, "CREATE TABLE a (id TEXT PRIMARY KEY, value TEXT CHECK (value IN ('1', '2')))");
            expect((await resolver.resolve(oldEvidence, oldProof, select)).status).toBe("unavailable");

            await expect.poll(async () => (await select.runNow())?.columns, { timeout: 10_000 }).toEqual([
                { name: "value", typeId: 25 },
            ]);
            const renewed = (await select.runNow())!;
            const result = await resolver.resolve(renewed, analyzeProjectQueryProvenance(renewed), select);
            expect(result.status).toBe("resolved");
            expect(result.physicalColumns[0]?.field).toMatchObject({
                name: "value",
                kind: "text",
                checkOptions: ["1", "2"],
            });
        } finally {
            resolver.dispose();
            select.dispose();
        }
    });

    it("returns unsupported lineage as readable evidence without manufacturing fields", async () => {
        const doc = new Y.Doc({ guid: "grid-metadata-unsupported" });
        const tableId = createTable(doc, "A", "a");
        const handles = getTableHandles(doc, tableId)!;
        setSchemaText(handles, "CREATE TABLE a (id TEXT PRIMARY KEY, value INTEGER)");
        addRecord(handles, { value: 1 }, "a1");
        const select = createProjectSelectSession({
            projectDoc: doc,
            query: "SELECT DISTINCT value + 1 AS calculated FROM a",
            connect,
            requireExplicitAliases: false,
        });
        const resolver = createGridMetadataResolver({ projectDoc: doc, connect });
        try {
            const evidence = (await select.runNow())!;
            const result = await resolver.resolve(evidence, analyzeProjectQueryProvenance(evidence), select);
            expect(result.status).toBe("unsupported");
            expect(result.columns).toEqual([{ index: 0, name: "calculated", typeId: 23 }]);
            expect(result.rows).toEqual([{ calculated: 2 }]);
            expect(result.physicalColumns).toEqual([]);
        } finally {
            resolver.dispose();
            select.dispose();
        }
    });
});
