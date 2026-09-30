import { expect } from "chai";
import fs from "fs-extra";
import type * as Y from "yjs";
import { OutlinerTableCreationService } from "../src/mcp/table-creation.js";
import { createDocumentStore, type DocumentStore } from "../src/persistence.js";
import { Project } from "../src/schema/app-schema.js";
import {
    AclStore,
    dbFile,
    deferred,
    projectState,
    rejection,
    restartFromStorage,
    seedProject,
    startTestServer,
    stopTestServer,
    storedRooms,
    tempDir,
    type TestServer,
    withRoom,
} from "./server-create-table-fixture.js";

const UID = "user-1";
const SCHEMA = "CREATE TABLE fragile (id TEXT PRIMARY KEY)";

// Issue #5411 AS-006 / AS-007: preparation failures and interrupted
// publication are never reported as success, and a post-publication storage
// failure is reported as unknown rather than as a no-effect failure.
describe("standalone Table creation failure outcomes (#5411 AS-006, AS-007)", function() {
    this.timeout(60000);
    const dirs: string[] = [];
    const servers: TestServer[] = [];
    let acl: AclStore;
    let server: TestServer;
    let dir: string;
    let realStore: DocumentStore;

    beforeEach(async () => {
        acl = new AclStore();
        acl.grant("projectUsers", "proj-a", UID);
        dir = tempDir();
        dirs.push(dir);
        server = await startTestServer(dir, acl);
        servers.push(server);
        realStore = createDocumentStore(server.persistence!);
        await seedProject(server.hocuspocus, "proj-a");
    });

    afterEach(async () => {
        for (const s of servers.splice(0)) await stopTestServer(s);
        for (const d of dirs.splice(0)) await fs.remove(d);
    });

    /** The production service over the real persistence seam, with an injectable storage failure. */
    const serviceWith = (store: DocumentStore) =>
        new OutlinerTableCreationService(server.hocuspocus, acl.checkAccess, store);
    const tableIds = () =>
        withRoom(server.hocuspocus, "projects/proj-a", doc => Object.keys(projectState(doc).tables).sort());

    it("reports confirmed non-publication when the Table room cannot be stored", async () => {
        const before = await tableIds();
        const service = serviceWith(async (room, doc) => {
            if (room.includes("/tables/")) throw new Error("disk full");
            await realStore(room, doc);
        });
        const error = await rejection(service.createTable(UID, "proj-a", { name: "F", schemaSql: SCHEMA }));
        expect(error.code).to.equal("internal_failure");
        expect(error.debug).to.include({ outcome: "not_published" });
        expect(await tableIds()).to.deep.equal(before);
        const relations = await server.mcpRelations.listRelations(UID, "proj-a");
        expect(relations.relations.map(relation => relation.relation)).not.to.include("fragile");
    });

    it("does not publish a Table prepared before a crash, even after restart", async () => {
        const prepared = deferred();
        void serviceWith(realStore).createTable(UID, "proj-a", { name: "F", schemaSql: SCHEMA }, {
            beforePublication: () => {
                prepared.resolve();
                return new Promise(() => {}); // execution stops before publication
            },
        });
        await prepared.promise;
        const restarted = await restartFromStorage(dir, acl);
        dirs.push(restarted.dir);
        servers.push(restarted.server);
        // The prepared room may physically remain in storage...
        const candidateRooms = storedRooms(restarted.dir).filter(room =>
            room.startsWith("projects/proj-a/tables/") && !room.endsWith("table-existing")
        );
        expect(candidateRooms).to.have.length(1);
        expect(await withRoom(restarted.server.hocuspocus, candidateRooms[0], doc => doc.getText("schema").toString()))
            .to.equal(SCHEMA);
        // ...but it is not a Table: normal discovery never sees it.
        const relations = await restarted.server.mcpRelations.listRelations(UID, "proj-a");
        expect(relations.relations.map(relation => relation.relation)).to.deep.equal([
            "existing_table",
            "outline_items",
        ]);
        const registry = await withRoom(
            restarted.server.hocuspocus,
            "projects/proj-a",
            doc => projectState(doc).tables,
        );
        expect(Object.keys(registry)).to.deep.equal(["table-existing"]);
    });

    it("returns an unknown outcome when the published registry cannot be stored", async () => {
        const service = serviceWith(async (room, doc) => {
            if (room === "projects/proj-a") {
                // An unrelated peer edit lands while storage is failing.
                Project.fromDoc(doc as Y.Doc).addPage("Peer page", "peer");
                throw new Error("store acknowledgement lost");
            }
            await realStore(room, doc);
        });
        const outcome = await service.createTable(UID, "proj-a", { name: "F", schemaSql: SCHEMA });
        expect(outcome.status).to.equal("unknown");
        expect(outcome).to.include({ applied: false, sqlName: "fragile", schemaSql: SCHEMA });
        expect(outcome).not.to.have.property("revision");
        if (outcome.status !== "unknown") throw new Error("expected unknown");
        expect(outcome.tableId).to.be.a("string");
        // A present entry references the already-prepared complete schema.
        const state = await withRoom(server.hocuspocus, "projects/proj-a", doc => ({
            tables: projectState(doc).tables,
            pages: [...Project.fromDoc(doc).items].map(page => page.text),
        }));
        expect(state.tables[outcome.tableId]).to.include({ name: "F", sqlName: "fragile" });
        expect(state.pages).to.include("Peer page");
        expect(
            await withRoom(server.hocuspocus, `projects/proj-a/tables/${outcome.tableId}`, doc => ({
                schema: doc.getText("schema").toString(),
                records: doc.getMap("data").size,
            })),
        ).to.deep.equal({ schema: SCHEMA, records: 0 });
    });

    it("acknowledges success only after storage holds both the Table room and the registry", async () => {
        const snapshot = tempDir();
        dirs.push(snapshot);
        const service = serviceWith(async (room, doc) => {
            await realStore(room, doc);
            // Capture storage at the acknowledgement point, before any
            // Hocuspocus disconnect or debounced store could flush it.
            if (room === "projects/proj-a") fs.copyFileSync(dbFile(dir), dbFile(snapshot));
        });
        const outcome = await service.createTable(UID, "proj-a", { name: "F", schemaSql: SCHEMA });
        if (outcome.status !== "created") throw new Error("expected created");
        const restarted = await restartFromStorage(snapshot, acl);
        dirs.push(restarted.dir);
        servers.push(restarted.server);
        const table = await restarted.server.mcpRelations.getTable(UID, "proj-a", outcome.tableId);
        expect(table).to.include({ rawSchemaSql: SCHEMA, sqlName: "fragile", revision: outcome.revision });
    });
});
