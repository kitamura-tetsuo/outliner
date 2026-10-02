import { expect } from "chai";
import fs from "fs-extra";
import * as Y from "yjs";
import { GridPresentationUndisclosedError, OutlinerGridPresentationService } from "../src/mcp/grid-presentation.js";
import { createDocumentStore } from "../src/persistence.js";
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
import { PROJECT, readGridAsClient, recordUpdates, seedGridProject } from "./server-grid-presentation-fixture.js";

const UID = "user-1";

// Issue #5435 REQ-006 / AS-006: reads and updates are authorized only by the
// resource-side project grants, through the real ACL adapter (the fixture
// disables ALLOW_TEST_ACCESS), before metadata is read, again at the final
// mutation boundary, and again before an awaited result is disclosed.
describe("Grid presentation update: authorization (#5435 REQ-006, AS-006)", function() {
    this.timeout(60000);
    let acl: AclStore;
    let server: TestServer;
    let dir: string;
    let revision: string;

    beforeEach(async () => {
        acl = new AclStore();
        acl.grant("projectUsers", PROJECT, UID);
        dir = tempDir();
        server = await startTestServer(dir, acl);
        expect(process.env.ALLOW_TEST_ACCESS).to.equal("false");
        await seedGridProject(server.hocuspocus);
        revision = (await server.gridPresentation.readPresentation(UID, PROJECT, "grid-tasks")).presentationRevision;
    });

    afterEach(async () => {
        await stopTestServer(server);
        await fs.remove(dir);
    });

    const request = (gridId = "grid-tasks") => ({
        projectId: PROJECT,
        gridId,
        expectedPresentationRevision: revision,
        changes: { components: { title: { label: "件名" } } },
    });
    const liveLabels = () =>
        withRoom(
            server.hocuspocus,
            `projects/${PROJECT}`,
            doc => readGridAsClient(Y.encodeStateAsUpdate(doc), "grid-tasks")!.labels,
        );

    /** Every operation is a bare forbidden: no metadata, no not_found/stale distinction, no update. */
    const deniedEverywhere = async (service = server.gridPresentation) => {
        const recorder = await recordUpdates(server.hocuspocus);
        try {
            for (
                const attempt of [
                    service.readPresentation(UID, PROJECT, "grid-tasks"),
                    service.readPresentation(UID, PROJECT, "grid-missing"),
                    service.updatePresentation(UID, request()),
                    service.updatePresentation(UID, { ...request(), dryRun: true }),
                    service.updatePresentation(UID, request("grid-missing")),
                    service.updatePresentation(UID, { ...request(), expectedPresentationRevision: "stale" }),
                ]
            ) {
                const error = await rejection(attempt);
                expect(error.code).to.equal("forbidden");
                expect(error.debug).to.deep.equal({ effect: "none" });
            }
            expect(recorder.updates).to.have.length(0);
        } finally {
            await recorder.stop();
        }
        expect(await liveLabels()).to.deep.equal({});
    };

    it("denies a caller without a resource-side grant", async () => {
        acl.revokeAll(PROJECT);
        await deniedEverywhere();
    });

    it("does not accept a user-owned directory entry as permission", async () => {
        acl.revokeAll(PROJECT);
        acl.grant("userProjects", PROJECT, UID);
        await deniedEverywhere();
    });

    it("denies when the access backend fails", async () => {
        acl.failing = true;
        await deniedEverywhere();
    });

    it("accepts the legacy containerUsers grant", async () => {
        acl.revokeAll(PROJECT);
        acl.grant("containerUsers", PROJECT, UID);
        expect(await server.gridPresentation.updatePresentation(UID, request())).to.include({ applied: true });
        expect(await liveLabels()).to.deep.equal({ title: "件名" });
    });

    it("denies an update whose grant is revoked while it is paused before the final compare", async () => {
        const reached = deferred();
        const resume = deferred();
        const pending = server.gridPresentation.updatePresentation(UID, request(), {
            beforeMutation: async () => {
                reached.resolve();
                await resume.promise;
            },
        });
        await reached.promise;
        acl.revokeAll(PROJECT);
        resume.resolve();
        const error = await rejection(pending);
        expect(error.code).to.equal("forbidden");
        expect(error.debug).to.deep.equal({ effect: "none" });
        expect(await liveLabels()).to.deep.equal({});
    });

    it("withholds a read result when the grant is revoked before disclosure", async () => {
        let calls = 0;
        const service = new OutlinerGridPresentationService(server.hocuspocus, async (uid, projectId) => {
            // Revoke after the in-room check, while the read is being released.
            if (++calls === 3) acl.revokeAll(projectId);
            return await acl.checkAccess(uid, projectId);
        });
        const error = await rejection(service.readPresentation(UID, PROJECT, "grid-tasks"));
        expect(error.code).to.equal("forbidden");
        expect(error.debug).to.deep.equal({ effect: "none" });
        expect(calls).to.equal(3);
    });

    it("withholds an applied result after revocation without undoing the authorized effect", async () => {
        const storing = deferred();
        const finishStore = deferred();
        const realStore = createDocumentStore(server.persistence!);
        const service = new OutlinerGridPresentationService(server.hocuspocus, acl.checkAccess, async (room, doc) => {
            storing.resolve();
            await finishStore.promise;
            await realStore(room, doc);
        });
        const pending = service.updatePresentation(UID, request());
        await storing.promise;
        // The effect is already in the live room when access is revoked.
        expect(await liveLabels()).to.deep.equal({ title: "件名" });
        acl.revokeAll(PROJECT);
        finishStore.resolve();
        const error = await rejection(pending) as GridPresentationUndisclosedError;
        expect(error).to.be.instanceOf(GridPresentationUndisclosedError);
        expect(error.code).to.equal("forbidden");
        expect(error.debug).to.deep.equal({ effect: "undisclosed" });
        expect(JSON.stringify(error.debug)).not.to.contain("grid-presentation-v1");
        // The internal receipt keeps the established outcome; nothing was rolled back.
        expect(error.receipt).to.include({ status: "applied", applied: true, priorPresentationRevision: revision });
        expect(await liveLabels()).to.deep.equal({ title: "件名" });
        expect(
            await withRoom(server.hocuspocus, `projects/${PROJECT}`, doc => doc.getMap("yjsGrids").has("grid-tasks")),
        )
            .to.equal(true);
    });
});
