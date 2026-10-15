import { createSqlCatalogObject, replaceSqlCatalogSource } from "$shared/services/sqlCatalog";
import { afterAll, afterEach, describe, expect, it } from "vitest";
import * as Y from "yjs";
import { createGridMetadataResolver } from "./gridMetadataResolver";
import { resetPgliteForTests } from "./pgliteService";
import { analyzeProjectQueryProvenance } from "./projectQueryProvenance";
import {
    createProjectSelectSession,
    type ProjectSelectEvidence,
    type ProjectSelectSession,
} from "./projectSelectSession";
import { addRecord, createTable, getTableHandles, setSchemaText } from "./tableDocs";
import { resetTableEngineForTests, type TableDocConnector } from "./tableEngine";

const connect: TableDocConnector = async () => ({
    waitForInitialSync: async () => ({ synced: true }),
    dispose: () => {},
});

afterEach(async () => await resetTableEngineForTests());
afterAll(async () => await resetPgliteForTests());

function enumProject(projectId: string, labels: string[], tableId = "shared-table") {
    const doc = new Y.Doc({ guid: projectId });
    const catalog = doc as unknown as Parameters<typeof createSqlCatalogObject>[0];
    const catalogId = createSqlCatalogObject(
        catalog,
        "enum",
        `CREATE TYPE task_state AS ENUM (${labels.map(label => `'${label}'`).join(", ")})`,
    );
    createTable(doc, "Tasks", "tasks", { tableId });
    const handles = getTableHandles(doc, tableId)!;
    setSchemaText(handles, "CREATE TABLE tasks (id TEXT PRIMARY KEY, state task_state)");
    addRecord(handles, { state: labels[0]! }, "task-1");
    return { doc, catalog, catalogId, handles };
}

async function renewedAfter(
    session: ProjectSelectSession,
    generation: number,
): Promise<ProjectSelectEvidence> {
    await expect.poll(() => {
        const state = session.state;
        return state.status === "success" && state.evidence.catalogGeneration > generation
            ? state.evidence
            : undefined;
    }, { timeout: 30_000 }).toBeDefined();
    const state = session.state;
    if (state.status !== "success") throw new Error("Project SELECT did not renew after catalog replacement");
    return state.evidence;
}

async function executeEventually(session: ProjectSelectSession): Promise<ProjectSelectEvidence> {
    await expect.poll(async () => await session.runNow(), { timeout: 30_000 }).toBeDefined();
    const state = session.state;
    if (state.status !== "success") throw new Error(`Project SELECT failed: ${JSON.stringify(state)}`);
    return state.evidence;
}

describe("Grid metadata Project and catalog authority", { timeout: 60_000 }, () => {
    it("renews exact ENUM labels after catalog replacement without changing Table schema", async () => {
        const { doc, catalog, catalogId, handles } = enumProject("metadata-enum-renewal", ["Open", "Done"]);
        const select = createProjectSelectSession({
            projectDoc: doc,
            projectId: doc.guid,
            query: "SELECT state FROM tasks",
            connect,
            requireExplicitAliases: false,
        });
        const resolver = createGridMetadataResolver({ projectDoc: doc, projectId: doc.guid, connect });
        try {
            const oldEvidence = await executeEventually(select);
            const schemaText = handles.schemaText.toString();
            replaceSqlCatalogSource(catalog, catalogId, "CREATE TYPE task_state AS ENUM ('Done', 'Open', 'Blocked')");

            expect((await resolver.resolve(oldEvidence, analyzeProjectQueryProvenance(oldEvidence), select)).status)
                .toBe("unavailable");
            const renewed = await renewedAfter(select, oldEvidence.catalogGeneration);
            const beforeResolve = [...Y.encodeStateVector(handles.doc)];
            const result = await resolver.resolve(renewed, analyzeProjectQueryProvenance(renewed), select);

            expect(result.status).toBe("resolved");
            expect(result.physicalColumns[0]).toMatchObject({
                physicalColumn: "state",
                source: { id: handles.tableId, sqlName: "tasks" },
                field: { enumLabels: ["Done", "Open", "Blocked"] },
            });
            expect(handles.schemaText.toString()).toBe(schemaText);
            expect([...Y.encodeStateVector(handles.doc)]).toEqual(beforeResolve);
        } finally {
            resolver.dispose();
            select.dispose();
        }
    });

    it("rejects current evidence from a different Project with identical Table identity and schema text", async () => {
        const p = enumProject("metadata-project-p", ["Open", "Done"]);
        const q = enumProject("metadata-project-q", ["Open", "Blocked"]);
        const query = "SELECT state FROM tasks";
        const pSession = createProjectSelectSession({
            projectDoc: p.doc,
            projectId: p.doc.guid,
            query,
            connect,
            requireExplicitAliases: false,
        });
        const qSession = createProjectSelectSession({
            projectDoc: q.doc,
            projectId: q.doc.guid,
            query,
            connect,
            requireExplicitAliases: false,
        });
        const qResolver = createGridMetadataResolver({ projectDoc: q.doc, projectId: q.doc.guid, connect });
        try {
            const pEvidence = await executeEventually(pSession);
            await executeEventually(qSession);
            const result = await qResolver.resolve(
                pEvidence,
                analyzeProjectQueryProvenance(pEvidence),
                pSession,
            );

            expect(result.status).toBe("unavailable");
            expect(result.physicalColumns).toEqual([]);
        } finally {
            qResolver.dispose();
            pSession.dispose();
            qSession.dispose();
        }
    });
});
