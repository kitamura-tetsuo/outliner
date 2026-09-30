import { expect } from "chai";
import fs from "fs-extra";
import { OutlinerTableCreationService } from "../src/mcp/table-creation.js";
import { createDocumentStore } from "../src/persistence.js";
import {
    AclStore,
    deferred,
    projectState,
    rejection,
    seedProject,
    startTestServer,
    stopTestServer,
    storedRooms,
    tempDir,
    type TestServer,
    withRoom,
} from "./server-create-table-fixture.js";

const UID = "user-1";
const REQUEST = { name: "Guarded", schemaSql: "CREATE TABLE guarded (id TEXT)" };

// Issue #5411 AS-008: authorization is enforced through the production
// resource-side ACL adapter (checkContainerAccess) at the mutation boundary.
describe("standalone Table creation authorization (#5411 AS-008)", function() {
    this.timeout(60000);
    let dir: string;
    let server: TestServer;
    let acl: AclStore;

    beforeEach(async () => {
        acl = new AclStore();
        dir = tempDir();
        server = await startTestServer(dir, acl);
        await seedProject(server.hocuspocus, "proj-a");
    });

    afterEach(async () => {
        await stopTestServer(server);
        await fs.remove(dir);
    });

    const tableRooms = () => [
        ...storedRooms(dir).filter(room => room.includes("/tables/") && !room.endsWith("table-existing")),
        ...[...server.hocuspocus.documents.keys()].filter(room =>
            room.includes("/tables/") && !room.endsWith("table-existing")
        ),
    ];
    const registry = () => withRoom(server.hocuspocus, "projects/proj-a", doc => projectState(doc).tables);

    it("denies without a resource-side grant or when the ACL lookup fails, before any preparation", async () => {
        // A user-writable personal project list is not a grant.
        acl.grant("userProjects", "proj-a", UID);
        expect((await rejection(server.tableCreation.createTable(UID, "proj-a", REQUEST))).code).to.equal("forbidden");
        acl.grant("projectUsers", "proj-a", UID);
        acl.failing = true;
        expect((await rejection(server.tableCreation.createTable(UID, "proj-a", REQUEST))).code).to.equal("forbidden");
        expect(tableRooms()).to.deep.equal([]);
        expect(Object.keys(await registry())).to.deep.equal(["table-existing"]);
    });

    it("accepts the legacy containerUsers grant", async () => {
        acl.grant("containerUsers", "proj-a", UID);
        expect((await server.tableCreation.createTable(UID, "proj-a", REQUEST)).status).to.equal("created");
    });

    it("refuses to create a project as a side effect", async () => {
        acl.grant("projectUsers", "proj-empty", UID);
        const error = await rejection(server.tableCreation.createTable(UID, "proj-empty", REQUEST));
        expect(error.code).to.equal("not_found");
        expect(tableRooms()).to.deep.equal([]);
    });

    it("does not publish when grants are removed before the final authorization check", async () => {
        acl.grant("projectUsers", "proj-a", UID);
        acl.grant("containerUsers", "proj-a", UID);
        const error = await rejection(server.tableCreation.createTable(UID, "proj-a", REQUEST, {
            beforePublication: async () => {
                acl.revokeAll("proj-a");
            },
        }));
        expect(error.code).to.equal("forbidden");
        expect(error.debug).to.include({ outcome: "not_published" });
        // A prepared, unregistered room may remain; the registry is unchanged.
        expect(tableRooms().length).to.be.greaterThan(0);
        expect(Object.keys(await registry())).to.deep.equal(["table-existing"]);
    });

    for (const storeFails of [false, true]) {
        it(`withholds the result from a caller revoked while publication is stored (storeFails=${storeFails})`, async () => {
            acl.grant("projectUsers", "proj-a", UID);
            const realStore = createDocumentStore(server.persistence!);
            const storing = deferred();
            const release = deferred();
            // The production service over the real persistence seam, with a
            // barrier held inside the project-room store after publication.
            const service = new OutlinerTableCreationService(
                server.hocuspocus,
                acl.checkAccess,
                async (room, doc) => {
                    if (room === "projects/proj-a") {
                        storing.resolve();
                        await release.promise;
                        if (storeFails) throw new Error("store acknowledgement lost");
                    }
                    await realStore(room, doc);
                },
            );
            const attempt = rejection(service.createTable(UID, "proj-a", REQUEST));
            await storing.promise;
            acl.revokeAll("proj-a");
            release.resolve();
            const error = await attempt;
            expect(error.code).to.equal("forbidden");
            expect(error.debug).to.deep.equal({ outcome: "published_undisclosed" });
            // The authorized publication stays; nothing about it is disclosed.
            const tables = await registry();
            const created = Object.keys(tables).filter(id => id !== "table-existing");
            expect(created).to.have.length(1);
            expect(tables[created[0]]).to.include({ name: "Guarded", sqlName: "guarded" });
            const disclosed = JSON.stringify({ message: (error as Error).message, debug: error.debug });
            expect(disclosed).not.to.contain(created[0]);
            expect(disclosed).not.to.contain(REQUEST.schemaSql);
        });
    }
});
