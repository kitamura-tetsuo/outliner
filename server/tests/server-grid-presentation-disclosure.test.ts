import { expect } from "chai";
import fs from "fs-extra";
import * as Y from "yjs";
import {
    type GridPresentationChanges,
    GridPresentationUndisclosedError,
    OutlinerGridPresentationService,
} from "../src/mcp/grid-presentation.js";
import type { LiveRoomHost } from "../src/mcp/live-room.js";
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
import {
    PROJECT,
    readGridAsClient,
    readStoredGridAsClient,
    seedGridProject,
} from "./server-grid-presentation-fixture.js";

const UID = "user-1";

// Issue #5435 REQ-006: authority is rechecked after the direct connection to
// the project room has been released, immediately before an update result is
// disclosed. A grant revoked while the release is pending withholds preview,
// no-op and applied results alike; an applied effect is kept, and its receipt
// stays on the error.
describe("Grid presentation update: disclosure after connection release (#5435 REQ-006)", function() {
    this.timeout(60000);
    let acl: AclStore;
    let server: TestServer;
    let dir: string;

    beforeEach(async () => {
        acl = new AclStore();
        acl.grant("projectUsers", PROJECT, UID);
        dir = tempDir();
        server = await startTestServer(dir, acl);
        expect(process.env.ALLOW_TEST_ACCESS).to.equal("false");
        await seedGridProject(server.hocuspocus);
    });

    afterEach(async () => {
        await stopTestServer(server);
        await fs.remove(dir);
    });

    /**
     * The production service over the real Hocuspocus rooms, whose direct
     * connections pause in disconnect() until released: an observable barrier
     * on the actual connection release.
     */
    const serviceWithHeldRelease = () => {
        const releasing = deferred();
        const release = deferred();
        const host: LiveRoomHost = {
            documents: server.hocuspocus.documents,
            openDirectConnection: async (room, context) => {
                const connection = await server.hocuspocus.openDirectConnection(room, context as never);
                const disconnect = connection.disconnect.bind(connection);
                connection.disconnect = async options => {
                    releasing.resolve();
                    await release.promise;
                    return await disconnect(options);
                };
                return connection;
            },
        };
        const service = new OutlinerGridPresentationService(
            host,
            acl.checkAccess,
            createDocumentStore(server.persistence!),
        );
        return { service, releasing: releasing.promise, release: release.resolve };
    };

    const run = async (changes: GridPresentationChanges, dryRun: boolean) => {
        const { presentationRevision } = await server.gridPresentation.readPresentation(UID, PROJECT, "grid-tasks");
        const { service, releasing, release } = serviceWithHeldRelease();
        const pending = service.updatePresentation(UID, {
            projectId: PROJECT,
            gridId: "grid-tasks",
            expectedPresentationRevision: presentationRevision,
            changes,
            dryRun,
        });
        await releasing;
        acl.revokeAll(PROJECT);
        release();
        return { error: await rejection(pending), presentationRevision };
    };
    const liveLabels = () =>
        withRoom(
            server.hocuspocus,
            `projects/${PROJECT}`,
            doc => readGridAsClient(Y.encodeStateAsUpdate(doc), "grid-tasks")!.labels,
        );

    it("withholds a preview when the grant is revoked during connection release", async () => {
        const { error } = await run({ components: { title: { label: "件名" } } }, true);
        expect(error.code).to.equal("forbidden");
        expect(error.debug).to.deep.equal({ effect: "none" });
        expect({ ...await liveLabels() }).to.deep.equal({});
    });

    it("withholds a canonical no-op result when the grant is revoked during connection release", async () => {
        const { error } = await run({ showAddRowButton: true, components: { title: { label: null } } }, false);
        expect(error.code).to.equal("forbidden");
        expect(error.debug).to.deep.equal({ effect: "none" });
    });

    it("withholds an applied result but keeps the persisted effect and its receipt", async () => {
        const { error, presentationRevision } = await run({ components: { title: { label: "件名" } } }, false);
        expect(error).to.be.instanceOf(GridPresentationUndisclosedError);
        expect(error.code).to.equal("forbidden");
        expect(error.debug).to.deep.equal({ effect: "undisclosed" });
        const receipt = (error as GridPresentationUndisclosedError).receipt;
        expect(receipt).to.include({
            status: "applied",
            applied: true,
            priorPresentationRevision: presentationRevision,
        });
        expect({ ...await liveLabels() }).to.deep.equal({ title: "件名" });
        expect({ ...(await readStoredGridAsClient(dir, "grid-tasks"))!.labels }).to.deep.equal({ title: "件名" });
    });
});
