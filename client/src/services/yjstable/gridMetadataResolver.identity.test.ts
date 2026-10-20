import { afterAll, afterEach, describe, expect, it } from "vitest";
import * as Y from "yjs";
import { analyzeProjectQueryProvenance } from "../../../../shared/src/services/projectQueryProvenance";
import { createGridMetadataResolver } from "./gridMetadataResolver";
import { resetPgliteForTests } from "./pgliteService";
import { createProjectSelectSession } from "./projectSelectSession";
import { addRecord, createTable, getTableHandles, setSchemaText } from "./tableDocs";
import { hasWarmExpiryTimerForTests, resetTableEngineForTests, type TableDocConnector } from "./tableEngine";

afterEach(async () => await resetTableEngineForTests());
afterAll(async () => await resetPgliteForTests());

function table(doc: Y.Doc, sqlName: string, value: string) {
    const tableId = createTable(doc, sqlName.toUpperCase(), sqlName);
    const handles = getTableHandles(doc, tableId)!;
    setSchemaText(handles, `CREATE TABLE ${sqlName} (id TEXT PRIMARY KEY, value TEXT)`);
    addRecord(handles, { value }, `${sqlName}1`);
}

describe("Grid metadata query identity and disposal", { timeout: 30_000 }, () => {
    it("fences A-to-B-to-A evidence and a resolve disposed during acquisition", async () => {
        const doc = new Y.Doc({ guid: "grid-metadata-query-identity" });
        table(doc, "a", "A");
        table(doc, "b", "B");
        let connectionDisposals = 0;
        const connect: TableDocConnector = async () => ({
            waitForInitialSync: async () => ({ synced: true }),
            dispose: () => {
                connectionDisposals++;
            },
        });
        const select = createProjectSelectSession({
            projectDoc: doc,
            projectId: doc.guid,
            query: "SELECT value FROM a",
            connect,
            requireExplicitAliases: false,
        });
        const resolver = createGridMetadataResolver({ projectDoc: doc, projectId: doc.guid, connect });
        const oldEvidence = (await select.runNow())!;
        const oldProof = analyzeProjectQueryProvenance(oldEvidence);

        select.setQuery("SELECT value FROM b");
        select.setQuery("SELECT value FROM a");
        expect((await resolver.resolve(oldEvidence, oldProof, select)).status).toBe("unavailable");

        const renewed = (await select.runNow())!;
        const renewedProof = analyzeProjectQueryProvenance(renewed);
        expect((await resolver.resolve(renewed, renewedProof, select)).status).toBe("resolved");

        // acquire() is asynchronous even when the live relation is warm. Disposing
        // before that continuation resumes must fence the result and release its hold.
        const pending = resolver.resolve(renewed, renewedProof, select);
        resolver.dispose();
        await expect(pending).resolves.toMatchObject({ status: "unavailable", physicalColumns: [] });

        select.dispose();
        expect(hasWarmExpiryTimerForTests()).toBe(true);
        await resetTableEngineForTests();
        expect(connectionDisposals).toBe(1);
    });
});
