import { expect } from "chai";
import fs from "fs-extra";
import * as Y from "yjs";
import { setGridComponentField } from "../../shared/src/services/gridDefinition.js";
import type { GridPresentationPreview, OutlinerGridPresentationService } from "../src/mcp/grid-presentation.js";
import {
    AclStore,
    rejection,
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
    recordUpdates,
    seedGridProject,
    tableState,
} from "./server-grid-presentation-fixture.js";

const UID = "user-1";
const ROOM = `projects/${PROJECT}`;

// Issue #5435 AS-005 / AS-006: a preview is detached and has no effect, an
// apply revalidates independently, a deleted target is never recreated, and
// applied leaf writes merge with concurrent disjoint peer edits.
describe("Grid presentation update: preview, revalidation and leaf merging (#5435 AS-005, AS-006)", function() {
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

    const changes = {
        components: { due_date: { label: " 期限 " }, done: { shown: false } },
        columnOrder: ["done", "due_date", "dormant"],
        showAddRowButton: false,
    };
    const liveGrid = () =>
        withRoom(server.hocuspocus, ROOM, doc => readGridAsClient(Y.encodeStateAsUpdate(doc), "grid-tasks"));

    it("previews a mixed patch without any project, Table or undo effect", async () => {
        const undo = new Y.UndoManager(peer.grid("grid-tasks").entry, { trackedOrigins: new Set([null, peer]) });
        const before = await service.readPresentation(UID, PROJECT, "grid-tasks");
        const table = await tableState(server.hocuspocus);
        const recorder = await recordUpdates(server.hocuspocus);
        let preview: GridPresentationPreview;
        try {
            preview = await service.updatePresentation(UID, {
                projectId: PROJECT,
                gridId: "grid-tasks",
                expectedPresentationRevision: before.presentationRevision,
                changes,
                dryRun: true,
            }) as GridPresentationPreview;
            expect(recorder.updates).to.have.length(0);
        } finally {
            await recorder.stop();
        }
        expect(preview).to.deep.equal({
            dryRun: true,
            applied: false,
            projectId: PROJECT,
            gridId: "grid-tasks",
            presentation: before.presentation,
            presentationRevision: before.presentationRevision,
            priorPresentationRevision: before.presentationRevision,
            wouldChange: true,
            candidatePresentation: {
                name: "Tasks",
                columnOrder: ["done", "due_date", "dormant"],
                components: {
                    done: { label: null, type: null, shown: false },
                    dormant: { label: null, type: null, shown: true },
                    due_date: { label: "期限", type: null, shown: true },
                },
                showAddRowButton: false,
                confirmRowDelete: false,
            },
        });
        // The candidate is detached: mutating it does not reach the room.
        preview.candidatePresentation.components.done.shown = true;
        expect(undo.undoStack).to.have.length(0);
        expect(await tableState(server.hocuspocus)).to.deep.equal(table);
        const after = await service.readPresentation(UID, PROJECT, "grid-tasks");
        expect(after).to.deep.equal(before);
        undo.destroy();

        // The preview described the candidate exactly: an apply produces it.
        const applied = await service.updatePresentation(UID, {
            projectId: PROJECT,
            gridId: "grid-tasks",
            expectedPresentationRevision: before.presentationRevision,
            changes,
        });
        expect(applied.presentation).to.deep.equal({
            ...preview.candidatePresentation,
            components: {
                ...preview.candidatePresentation.components,
                done: { label: null, type: null, shown: false },
            },
        });
    });

    it("reports wouldChange false for a no-op preview", async () => {
        const before = await service.readPresentation(UID, PROJECT, "grid-tasks");
        const preview = await service.updatePresentation(UID, {
            projectId: PROJECT,
            gridId: "grid-tasks",
            expectedPresentationRevision: before.presentationRevision,
            changes: { showAddRowButton: true, components: { title: { label: null } } },
            dryRun: true,
        }) as GridPresentationPreview;
        expect(preview.wouldChange).to.equal(false);
        expect(preview.candidatePresentation).to.deep.equal(before.presentation);
    });

    it("rejects the previewed revision after a peer edit, and never recreates a deleted Grid", async () => {
        const before = await service.readPresentation(UID, PROJECT, "grid-tasks");
        const request = {
            projectId: PROJECT,
            gridId: "grid-tasks",
            expectedPresentationRevision: before.presentationRevision,
            changes,
        };
        await service.updatePresentation(UID, { ...request, dryRun: true });
        setGridComponentField(peer.grid("grid-tasks"), "title", "label", "Peer");
        expect((await rejection(service.updatePresentation(UID, request))).code).to.equal("stale_revision");
        expect((await liveGrid())!.labels).to.deep.equal({ title: "Peer" });

        const current = await service.readPresentation(UID, PROJECT, "grid-tasks");
        await service.updatePresentation(UID, {
            ...request,
            expectedPresentationRevision: current.presentationRevision,
            dryRun: true,
        });
        peer.doc.getMap("yjsGrids").delete("grid-tasks");
        for (const dryRun of [true, false]) {
            const error = await rejection(service.updatePresentation(UID, {
                ...request,
                expectedPresentationRevision: current.presentationRevision,
                dryRun,
            }));
            expect(error.code).to.equal("not_found");
            expect(error.debug).to.include({ effect: "none" });
        }
        expect((await rejection(service.readPresentation(UID, PROJECT, "grid-tasks"))).code).to.equal("not_found");
        expect(await liveGrid()).to.equal(undefined);
        expect(await withRoom(server.hocuspocus, ROOM, doc => doc.getMap("yjsGrids").has("grid-tasks"))).to.equal(
            false,
        );
    });

    it("merges concurrent disjoint peer component edits at their leaf boundaries", async () => {
        setGridComponentField(peer.grid("grid-tasks"), "due_date", "type", "date");
        setGridComponentField(peer.grid("grid-tasks"), "title", "label", "Title");
        const before = await service.readPresentation(UID, PROJECT, "grid-tasks");

        // The peer goes offline and edits other leaves of the same maps.
        peer.hold();
        setGridComponentField(peer.grid("grid-tasks"), "due_date", "hidden", true);
        setGridComponentField(peer.grid("grid-tasks"), "title", "type", "text");

        const result = await service.updatePresentation(UID, {
            projectId: PROJECT,
            gridId: "grid-tasks",
            expectedPresentationRevision: before.presentationRevision,
            changes: { components: { due_date: { label: "期限" }, title: { shown: false } } },
        });
        expect(result.applied).to.equal(true);

        // The peer's updates arrive after the local application.
        peer.release();
        const merged = await liveGrid();
        expect(merged!.labels).to.deep.equal({ due_date: "期限", title: "Title" });
        expect(merged!.types).to.deep.equal({ due_date: "date", title: "text" });
        expect(merged!.hidden).to.deep.equal({ due_date: true, title: true });
        // Both sides converge on the same state.
        expect(readGridAsClient(Y.encodeStateAsUpdate(peer.doc), "grid-tasks")).to.deep.equal(merged);
    });
});
