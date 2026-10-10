import { expect } from "chai";
import fs from "fs-extra";
import * as Y from "yjs";
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
} from "./server-create-table-fixture.js";

const UID = "user-1";
const SCHEMA = "CREATE TABLE previewed (id TEXT PRIMARY KEY, title TEXT)";

// Issue #5411 AS-004: a dry run makes the same decisions as an apply but writes,
// persists, and reserves nothing.
describe("standalone Table creation dry run (#5411 AS-004)", function() {
    this.timeout(60000);
    let dir: string;
    let server: TestServer;
    let acl: AclStore;

    beforeEach(async () => {
        acl = new AclStore();
        acl.grant("projectUsers", "proj-a", UID);
        dir = tempDir();
        server = await startTestServer(dir, acl);
        await seedProject(server.hocuspocus, "proj-a");
    });

    afterEach(async () => {
        await stopTestServer(server);
        await fs.remove(dir);
    });

    it("previews without a room, registry update, undo entry, or reservation", async () => {
        // Keep the live project room open to observe every document update.
        const connection = await server.hocuspocus.openDirectConnection("projects/proj-a", {});
        const project = connection.document as unknown as Y.Doc;
        const updates: Uint8Array[] = [];
        const onUpdate = (update: Uint8Array) => updates.push(update);
        project.on("update", onUpdate);
        const undo = new Y.UndoManager(project.getMap("yjsTables"), {
            trackedOrigins: new Set([null, "mcp-create-table"]),
        });
        try {
            const state = projectState(project);
            const rooms = storedRooms(dir);
            const loaded = [...server.hocuspocus.documents.keys()].sort();

            const preview = await server.tableCreation.createTable(UID, "proj-a", {
                name: "Preview",
                schemaSql: SCHEMA,
                dryRun: true,
            });
            expect(preview).to.deep.equal({
                status: "preview",
                applied: false,
                dryRun: true,
                displayName: "Preview",
                sqlName: "previewed",
                schemaSql: SCHEMA,
            });
            expect(preview).not.to.have.property("tableId");
            expect(preview).not.to.have.property("revision");
            expect(updates).to.have.length(0);
            expect(undo.undoStack).to.have.length(0);
            expect(projectState(project)).to.deep.equal(state);
            expect(storedRooms(dir)).to.deep.equal(rooms);
            const loadedAfter = [...server.hocuspocus.documents.keys()].sort();
            // Compiler startup may outlive Hocuspocus's idle-room timer. That
            // lifecycle unload is allowed; a dry run must not load a new Table
            // room or disturb any other room that remains live.
            expect(loadedAfter.every(room => loaded.includes(room))).to.equal(true);
            expect(loadedAfter.some(room => room.startsWith("projects/proj-a/tables/"))).to.equal(false);

            // Same refusals as an apply.
            const taken = await rejection(server.tableCreation.createTable(UID, "proj-a", {
                name: "Dup",
                schemaSql: "CREATE TABLE existing_table (id TEXT)",
                dryRun: true,
            }));
            expect(taken.code).to.equal("validation_failed");
            acl.revokeAll("proj-a");
            const denied = await rejection(server.tableCreation.createTable(UID, "proj-a", {
                name: "Preview",
                schemaSql: SCHEMA,
                dryRun: true,
            }));
            expect(denied.code).to.equal("forbidden");
        } finally {
            project.off("update", onUpdate);
            undo.destroy();
            await connection.disconnect();
        }
    });

    it("applies after a preview while the name is free, but never treats the preview as a reservation", async () => {
        await server.tableCreation.createTable(UID, "proj-a", { name: "P", schemaSql: SCHEMA, dryRun: true });
        const applied = await server.tableCreation.createTable(UID, "proj-a", { name: "P", schemaSql: SCHEMA });
        expect(applied.status).to.equal("created");

        const next = "CREATE TABLE later_claim (id TEXT)";
        await server.tableCreation.createTable(UID, "proj-a", { name: "Mine", schemaSql: next, dryRun: true });
        const other = await server.tableCreation.createTable(UID, "proj-a", { name: "Theirs", schemaSql: next });
        expect(other.status).to.equal("created");
        const refused = await rejection(
            server.tableCreation.createTable(UID, "proj-a", { name: "Mine", schemaSql: next }),
        );
        expect(refused.code).to.equal("validation_failed");
    });
});
