import { expect } from "chai";
import fs from "fs-extra";
import * as Y from "yjs";
import { setGridComponentField } from "../../shared/src/services/gridDefinition.js";
import { type GridPresentationApplied, OutlinerGridPresentationService } from "../src/mcp/grid-presentation.js";
import { createDocumentStore } from "../src/persistence.js";
import {
    AclStore,
    dbFile,
    restartFromStorage,
    startTestServer,
    stopTestServer,
    tempDir,
    type TestServer,
    withRoom,
} from "./server-create-table-fixture.js";
import {
    Peer,
    PROJECT,
    readGridAsClient,
    readStoredGridAsClient,
    seedGridProject,
    tableState,
    untouchedState,
} from "./server-grid-presentation-fixture.js";

const UID = "user-1";

// Issue #5435 AS-001: Japanese labels are a presentation-only change, made
// through the production domain operation over a Grid created and edited by
// the browser's normal writers, and visible to fresh normal readers and after
// a restart from acknowledged storage.
describe("Grid presentation update: labels are presentation-only (#5435 AS-001)", function() {
    this.timeout(60000);
    const dirs: string[] = [];
    const servers: TestServer[] = [];
    let acl: AclStore;
    let server: TestServer;
    let dir: string;

    beforeEach(async () => {
        acl = new AclStore();
        acl.grant("projectUsers", PROJECT, UID);
        dir = tempDir();
        dirs.push(dir);
        server = await startTestServer(dir, acl);
        servers.push(server);
        await seedGridProject(server.hocuspocus);
    });

    afterEach(async () => {
        for (const s of servers.splice(0)) await stopTestServer(s);
        for (const d of dirs.splice(0)) await fs.remove(d);
    });

    it("applies labels through the production service, keeps column keys, and survives restart", async () => {
        // A browser peer edits the Grid with the normal UI writer first.
        const browser = await Peer.connect(server.hocuspocus);
        setGridComponentField(browser.grid("grid-tasks"), "title", "label", "件名");
        await browser.disconnect();

        const service = server.gridPresentation;
        const before = await withRoom(server.hocuspocus, `projects/${PROJECT}`, doc => ({
            untouched: untouchedState(doc, "grid-tasks"),
            separate: readGridAsClient(Y.encodeStateAsUpdate(doc), "grid-separate"),
        }));
        const tableBefore = await tableState(server.hocuspocus);
        const read = await service.readPresentation(UID, PROJECT, "grid-tasks");
        expect(read).to.deep.include({
            projectId: PROJECT,
            gridId: "grid-tasks",
            sourceTableId: "table-tasks",
            query: "SELECT id, title, due_date, done FROM tasks",
        });
        expect(read.presentation.components).to.deep.equal({
            title: { label: "件名", type: null, shown: true, widthPx: null },
        });

        // Capture storage at the acknowledgement point, before any debounced
        // Hocuspocus store or disconnect could flush it.
        const acknowledged = tempDir();
        dirs.push(acknowledged);
        const realStore = createDocumentStore(server.persistence!);
        const acked = new OutlinerGridPresentationService(server.hocuspocus, acl.checkAccess, async (room, doc) => {
            await realStore(room, doc);
            fs.copyFileSync(dbFile(dir), dbFile(acknowledged));
        });
        const result = await acked.updatePresentation(UID, {
            projectId: PROJECT,
            gridId: "grid-tasks",
            expectedPresentationRevision: read.presentationRevision,
            changes: { components: { due_date: { label: "期限" }, done: { label: "完了" } } },
        }) as GridPresentationApplied;
        expect(result.dryRun).to.equal(false);
        expect(result.applied).to.equal(true);
        expect(result.priorPresentationRevision).to.equal(read.presentationRevision);
        expect(result.presentationRevision).to.match(/^grid-presentation-v1:/).and.not.equal(
            read.presentationRevision,
        );
        expect(result).not.to.have.property("candidatePresentation");
        expect(result.presentation.components).to.deep.equal({
            done: { label: "完了", type: null, shown: true, widthPx: null },
            due_date: { label: "期限", type: null, shown: true, widthPx: null },
            title: { label: "件名", type: null, shown: true, widthPx: null },
        });

        // A fresh normal client reader of the live room: labels changed, keys did not.
        const after = await withRoom(server.hocuspocus, `projects/${PROJECT}`, doc => ({
            untouched: untouchedState(doc, "grid-tasks"),
            tasks: readGridAsClient(Y.encodeStateAsUpdate(doc), "grid-tasks"),
            separate: readGridAsClient(Y.encodeStateAsUpdate(doc), "grid-separate"),
        }));
        expect(after.tasks!.labels).to.deep.equal({ title: "件名", due_date: "期限", done: "完了" });
        expect(after.tasks!.query).to.equal("SELECT id, title, due_date, done FROM tasks");
        // Both placements still resolve the one shared definition; the
        // separate Grid over the same Table is unchanged.
        expect(after.untouched).to.deep.equal(before.untouched);
        expect(after.untouched.placements.filter(p => p.gridId === "grid-tasks")).to.have.length(2);
        expect(after.separate).to.deep.equal(before.separate);
        expect(await tableState(server.hocuspocus)).to.deep.equal(tableBefore);
        expect((await service.readPresentation(UID, PROJECT, "grid-tasks")).presentationRevision)
            .to.equal(result.presentationRevision);

        // Restart from exactly the acknowledged storage (no reuse of the old
        // in-memory document): the same definition is there.
        const restarted = await restartFromStorage(acknowledged, acl);
        dirs.push(restarted.dir);
        servers.push(restarted.server);
        const reread = await restarted.server.gridPresentation.readPresentation(UID, PROJECT, "grid-tasks");
        expect(reread.presentationRevision).to.equal(result.presentationRevision);
        expect(reread.presentation).to.deep.equal(result.presentation);
        const stored = await readStoredGridAsClient(acknowledged, "grid-tasks");
        expect(stored!.labels).to.deep.equal({ title: "件名", due_date: "期限", done: "完了" });
        expect(stored!.query).to.equal("SELECT id, title, due_date, done FROM tasks");
        expect(await tableState(restarted.server.hocuspocus)).to.deep.equal(tableBefore);
    });
});
