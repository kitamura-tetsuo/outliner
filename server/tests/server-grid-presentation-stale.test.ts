import { expect } from "chai";
import fs from "fs-extra";
import * as Y from "yjs";
import {
    renameGrid,
    setGridColumnOrder,
    setGridComponentField,
    setGridQuery,
} from "../../shared/src/services/gridDefinition.js";
import type { OutlinerGridPresentationService } from "../src/mcp/grid-presentation.js";
import { OutlinerReadService } from "../src/mcp/outliner-read-service.js";
import { Project } from "../src/schema/app-schema.js";
import {
    AclStore,
    deferred,
    rejection,
    startTestServer,
    stopTestServer,
    tempDir,
    type TestServer,
    withRoom,
} from "./server-create-table-fixture.js";
import { Peer, PROJECT, readGridAsClient, recordUpdates, seedGridProject } from "./server-grid-presentation-fixture.js";

const UID = "user-1";
const ROOM = `projects/${PROJECT}`;

// Issue #5435 AS-004: a presentation revision detects every presentation and
// query-context change made by any writer, a query-only token is never
// accepted, unrelated edits do not invalidate it, and the comparison happens
// at the final mutation boundary.
describe("Grid presentation update: stale revisions (#5435 AS-004)", function() {
    this.timeout(60000);
    let acl: AclStore;
    let server: TestServer;
    let dir: string;
    let service: OutlinerGridPresentationService;
    let peer: Peer;

    beforeEach(async () => {
        acl = new AclStore();
        acl.grant("projectUsers", PROJECT, UID);
        dir = tempDir();
        server = await startTestServer(dir, acl);
        service = server.gridPresentation;
        await seedGridProject(server.hocuspocus);
        peer = await Peer.connect(server.hocuspocus);
    });

    afterEach(async () => {
        await peer.disconnect();
        await stopTestServer(server);
        await fs.remove(dir);
    });

    const liveGrid = (gridId = "grid-tasks") =>
        withRoom(server.hocuspocus, ROOM, doc => readGridAsClient(Y.encodeStateAsUpdate(doc), gridId)!);
    const update = (expectedPresentationRevision: string, beforeMutation?: () => Promise<void>) =>
        service.updatePresentation(UID, {
            projectId: PROJECT,
            gridId: "grid-tasks",
            expectedPresentationRevision,
            changes: { components: { due_date: { label: "期限" } }, columnOrder: ["due_date", "title"] },
        }, { beforeMutation });

    it("rejects an old revision after a peer label edit and never accepts the query-only token", async () => {
        const readService = new OutlinerReadService(server.hocuspocus, acl.checkAccess, async () => []);
        const { presentationRevision: r } = await service.readPresentation(UID, PROJECT, "grid-tasks");
        const q = (await readService.getGrid(UID, PROJECT, "grid-tasks")).revision as string;
        expect(q).not.to.equal(r);

        setGridComponentField(peer.grid("grid-tasks"), "due_date", "label", "Due");
        // The authoritative room has the change; the query text is unchanged.
        expect((await liveGrid()).labels).to.deep.equal({ due_date: "Due" });
        expect((await readService.getGrid(UID, PROJECT, "grid-tasks")).revision).to.equal(q);

        const recorder = await recordUpdates(server.hocuspocus);
        try {
            const stale = await rejection(update(r));
            expect(stale.code).to.equal("stale_revision");
            const current = await service.readPresentation(UID, PROJECT, "grid-tasks");
            expect(stale.debug).to.include({
                effect: "none",
                currentPresentationRevision: current.presentationRevision,
            });
            const queryOnly = await rejection(update(q));
            expect(queryOnly.code).to.equal("stale_revision");
            expect(recorder.updates).to.have.length(0);
        } finally {
            await recorder.stop();
        }
        const after = await liveGrid();
        expect(after.labels).to.deep.equal({ due_date: "Due" });
        expect(after.columnOrder).to.deep.equal([]);
    });

    const contested: [string, () => void][] = [
        ["a peer visibility change", () => setGridComponentField(peer.grid("grid-tasks"), "done", "hidden", true)],
        ["a peer order change", () => setGridColumnOrder(peer.grid("grid-tasks"), ["done", "title"])],
        ["a peer rename", () => renameGrid(peer.doc, "grid-tasks", "Renamed")],
        ["a peer query change", () => setGridQuery(peer.grid("grid-tasks"), "SELECT id, title FROM tasks")],
        ["a peer source change", () => peer.grid("grid-tasks").entry.set("sourceTableId", "table-other")],
    ];
    for (const [what, edit] of contested) {
        it(`rejects a paused update when ${what} reaches the server before the final compare`, async () => {
            const { presentationRevision: r } = await service.readPresentation(UID, PROJECT, "grid-tasks");
            const reached = deferred();
            const resume = deferred();
            const pending = update(r, async () => {
                reached.resolve();
                await resume.promise;
            });
            await reached.promise;
            const before = await liveGrid();
            edit();
            // Observable barrier: the peer edit is in the authoritative room.
            const delivered = await liveGrid();
            expect(delivered).not.to.deep.equal(before);
            resume.resolve();
            const error = await rejection(pending);
            expect(error.code).to.equal("stale_revision");
            expect(await liveGrid()).to.deep.equal(delivered);
        });
    }

    it("applies over unrelated Table, other-Grid and Page edits made while paused", async () => {
        const { presentationRevision: r } = await service.readPresentation(UID, PROJECT, "grid-tasks");
        const reached = deferred();
        const resume = deferred();
        const pending = update(r, async () => {
            reached.resolve();
            await resume.promise;
        });
        await reached.promise;
        await withRoom(server.hocuspocus, `${ROOM}/tables/table-tasks`, doc => {
            (doc.getMap("data").get("r1") as Y.Map<unknown>).set("title", "Edited row");
        });
        setGridComponentField(peer.grid("grid-separate"), "title", "label", "Other label");
        peer.project.addPage("Peer page", "peer");
        expect((await liveGrid("grid-separate")).labels).to.deep.equal({ title: "Other label" });
        expect((await service.readPresentation(UID, PROJECT, "grid-tasks")).presentationRevision).to.equal(r);
        resume.resolve();
        const result = await pending;
        expect(result).to.include({ applied: true, priorPresentationRevision: r });
        expect((await liveGrid()).labels).to.deep.equal({ due_date: "期限" });
        expect((await liveGrid("grid-separate")).labels).to.deep.equal({ title: "Other label" });
        const pages = await withRoom(server.hocuspocus, ROOM, doc => [...Project.fromDoc(doc).items].map(p => p.text));
        expect(pages).to.include("Peer page");
        expect(
            await withRoom(
                server.hocuspocus,
                `${ROOM}/tables/table-tasks`,
                doc => (doc.getMap("data").get("r1") as Y.Map<unknown>).get("title"),
            ),
        ).to.equal("Edited row");
    });

    it("restores the original token after A -> B -> A (content equality, not activity tracking)", async () => {
        const { presentationRevision: a } = await service.readPresentation(UID, PROJECT, "grid-tasks");
        setGridComponentField(peer.grid("grid-tasks"), "title", "label", "B");
        const { presentationRevision: b } = await service.readPresentation(UID, PROJECT, "grid-tasks");
        expect(b).not.to.equal(a);
        setGridComponentField(peer.grid("grid-tasks"), "title", "label", undefined);
        expect((await service.readPresentation(UID, PROJECT, "grid-tasks")).presentationRevision).to.equal(a);
        // The token is a content precondition: the restored content accepts it.
        expect(await update(a)).to.include({ applied: true, priorPresentationRevision: a });
    });
});
