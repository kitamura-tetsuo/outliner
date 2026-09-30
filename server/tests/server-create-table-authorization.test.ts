import { expect } from "chai";
import fs from "fs-extra";
import {
    AclStore,
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
});
