import { expect } from "chai";
import fs from "fs-extra";
import {
    AclStore,
    deferred,
    rejection,
    seedProject,
    startTestServer,
    stopTestServer,
    tempDir,
    type TestServer,
    withRoom,
} from "./server-create-table-fixture.js";

const UID = "user-1";

function tablesNamed(doc: import("yjs").Doc, sqlName: string): string[] {
    return [...doc.getMap<import("yjs").Map<unknown>>("yjsTables").entries()]
        .filter(([, entry]) => entry.get("sqlName") === sqlName)
        .map(([id]) => id);
}

// Issue #5411 AS-003: a SQL-name claim published while a creation is paused at
// its final pre-publication boundary wins, without renaming either Table.
describe("standalone Table creation namespace claims (#5411 AS-003)", function() {
    this.timeout(60000);
    let dir: string;
    let server: TestServer;

    beforeEach(async () => {
        const acl = new AclStore();
        acl.grant("projectUsers", "proj-a", UID);
        acl.grant("projectUsers", "proj-b", UID);
        dir = tempDir();
        server = await startTestServer(dir, acl);
        await seedProject(server.hocuspocus, "proj-a");
        await seedProject(server.hocuspocus, "proj-b");
    });

    afterEach(async () => {
        await stopTestServer(server);
        await fs.remove(dir);
    });

    it("refuses a paused creation after another writer claims the same SQL name", async () => {
        const reached = deferred();
        const resume = deferred();
        const paused = server.tableCreation.createTable(
            UID,
            "proj-a",
            { name: "A", schemaSql: "CREATE TABLE shared_name (id TEXT)" },
            {
                beforePublication: async () => {
                    reached.resolve();
                    await resume.promise;
                },
            },
        );
        await reached.promise;
        const competing = await server.tableCreation.createTable(UID, "proj-a", {
            name: "B",
            schemaSql: 'CREATE TABLE "shared_name" (id TEXT, extra TEXT)',
        });
        if (competing.status !== "created") throw new Error("competing creation failed");
        // The competing claim is visible in A's live project state before A resumes.
        expect(await withRoom(server.hocuspocus, "projects/proj-a", doc => tablesNamed(doc, "shared_name")))
            .to.deep.equal([competing.tableId]);
        resume.resolve();
        const error = await rejection(paused);
        expect(error.code).to.equal("validation_failed");
        expect(error.debug).to.include({ code: "relation_name_unavailable", conflictingTableId: competing.tableId });
        const table = await server.mcpRelations.getTable(UID, "proj-a", competing.tableId);
        expect(table).to.include({ displayName: "B", sqlName: "shared_name" });
        expect(await withRoom(server.hocuspocus, "projects/proj-a", doc => tablesNamed(doc, "shared_name")))
            .to.deep.equal([competing.tableId]);
        expect(await withRoom(server.hocuspocus, "projects/proj-a", doc => tablesNamed(doc, "shared_name_1")))
            .to.deep.equal([]);
    });

    it("lets at most one of two overlapping creations publish a SQL name", async () => {
        const both = deferred();
        let arrived = 0;
        const hold = async () => {
            arrived++;
            if (arrived === 2) both.resolve();
            await both.promise;
        };
        const results = await Promise.allSettled([
            server.tableCreation.createTable(UID, "proj-a", {
                name: "First",
                schemaSql: "CREATE TABLE contested (id TEXT)",
            }, { beforePublication: hold }),
            server.tableCreation.createTable(UID, "proj-a", {
                name: "Second",
                schemaSql: "CREATE TABLE contested (key INTEGER PRIMARY KEY)",
            }, { beforePublication: hold }),
        ]);
        // Both requests reached the contested boundary before either published.
        expect(arrived).to.equal(2);
        expect(results.filter(result => result.status === "fulfilled")).to.have.length(1);
        const refused = results.find(result => result.status === "rejected") as PromiseRejectedResult;
        expect(refused.reason.code).to.equal("validation_failed");
        expect(await withRoom(server.hocuspocus, "projects/proj-a", doc => tablesNamed(doc, "contested")))
            .to.have.length(1);
    });

    it("allows duplicate display names and the same SQL name in another project", async () => {
        const first = await server.tableCreation.createTable(UID, "proj-a", {
            name: "Tasks",
            schemaSql: "CREATE TABLE tasks_one (id TEXT)",
        });
        const second = await server.tableCreation.createTable(UID, "proj-a", {
            name: "Tasks",
            schemaSql: "CREATE TABLE tasks_two (id TEXT)",
        });
        const elsewhere = await server.tableCreation.createTable(UID, "proj-b", {
            name: "Tasks",
            schemaSql: "CREATE TABLE tasks_one (id TEXT)",
        });
        for (const result of [first, second, elsewhere]) expect(result.status).to.equal("created");
        expect(new Set([first, second, elsewhere].map(result => (result as { tableId: string; }).tableId)).size)
            .to.equal(3);
    });
});
