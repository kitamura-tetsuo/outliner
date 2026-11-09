import { expect } from "chai";
import fs from "fs-extra";
import * as Y from "yjs";
import { setGridComponentField } from "../../shared/src/services/gridDefinition.js";
import { GridPresentationEffectError, OutlinerGridPresentationService } from "../src/mcp/grid-presentation.js";
import { createDocumentStore, type DocumentStore } from "../src/persistence.js";
import {
    AclStore,
    rejection,
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
} from "./server-grid-presentation-fixture.js";

const UID = "user-1";
const ROOM = `projects/${PROJECT}`;

// Issue #5435 REQ-008 / AS-007: real project persistence; a failure before
// the mutation has no effect, a storage failure after it is an unknown
// effect (never ordinary success or no-effect), nothing is rolled back over
// other accepted edits, and a throwing observer cannot erase an established
// effect.
describe("Grid presentation update: persistence and failure outcomes (#5435 AS-007)", function() {
    this.timeout(60000);
    const dirs: string[] = [];
    const servers: TestServer[] = [];
    let acl: AclStore;
    let server: TestServer;
    let dir: string;
    let realStore: DocumentStore;
    let revision: string;

    beforeEach(async () => {
        acl = new AclStore();
        acl.grant("projectUsers", PROJECT, UID);
        dir = tempDir();
        dirs.push(dir);
        server = await startTestServer(dir, acl);
        servers.push(server);
        realStore = createDocumentStore(server.persistence!);
        await seedGridProject(server.hocuspocus);
        revision = (await server.gridPresentation.readPresentation(UID, PROJECT, "grid-tasks")).presentationRevision;
    });

    afterEach(async () => {
        for (const s of servers.splice(0)) await stopTestServer(s);
        for (const d of dirs.splice(0)) await fs.remove(d);
    });

    const serviceWith = (store: DocumentStore) =>
        new OutlinerGridPresentationService(server.hocuspocus, acl.checkAccess, store);
    const request = {
        projectId: PROJECT,
        gridId: "grid-tasks",
        get expectedPresentationRevision() {
            return revision;
        },
        changes: { components: { due_date: { label: "期限" } } },
    };
    const live = () =>
        withRoom(server.hocuspocus, ROOM, doc => readGridAsClient(Y.encodeStateAsUpdate(doc), "grid-tasks")!);

    it("reports no effect for a failure before the mutation", async () => {
        const error = await rejection(
            serviceWith(realStore).updatePresentation(UID, { ...request }, {
                beforeMutation: async () => {
                    throw new Error("preparation crashed");
                },
            }),
        );
        expect(error.code).to.equal("internal_failure");
        expect(error.debug).to.include({ effect: "none" });
        expect((await live()).labels).to.deep.equal({});
    });

    it("reports an unknown effect when storage fails after the write, without rolling back", async () => {
        const peer = await Peer.connect(server.hocuspocus);
        const service = serviceWith(async (room, doc) => {
            // Another accepted edit lands while storage is failing.
            setGridComponentField(peer.grid("grid-tasks"), "title", "label", "Peer");
            expect(doc.getMap("yjsGrids").has("grid-tasks")).to.equal(true);
            throw new Error(`store acknowledgement lost for ${room}`);
        });
        const error = await rejection(service.updatePresentation(UID, { ...request })) as GridPresentationEffectError;
        await peer.disconnect();
        expect(error).to.be.instanceOf(GridPresentationEffectError);
        expect(error.code).to.equal("internal_failure");
        expect(error.debug).to.include({ effect: "unknown", applied: null, priorPresentationRevision: revision });
        expect(error.debug).not.to.have.property("presentationRevision");
        expect(error.receipt).to.include({ status: "unknown", applied: null });
        // Neither restored nor erased: the write and the peer's edit both stand.
        expect((await live()).labels).to.deep.equal({ due_date: "期限", title: "Peer" });
    });

    it("keeps an established effect when an observer throws, and stores it durably", async () => {
        let observed = 0;
        const observer = () => {
            observed++;
            throw new Error("observer failure");
        };
        // Hold the room open so the observer stays attached to the live entry.
        const holder = await server.hocuspocus.openDirectConnection(ROOM, {} as never);
        const liveEntry = (holder.document as unknown as Y.Doc).getMap<Y.Map<unknown>>("yjsGrids").get("grid-tasks")!;
        liveEntry.observeDeep(observer);
        try {
            const result = await serviceWith(realStore).updatePresentation(UID, { ...request });
            expect(result).to.include({ dryRun: false, applied: true, priorPresentationRevision: revision });
            expect(result.presentation.components.due_date.label).to.equal("期限");
            expect(observed).to.equal(1);
        } finally {
            liveEntry.unobserveDeep(observer);
            await holder.disconnect();
        }
        // The acknowledged storage holds it: a new server started from it sees it.
        const restarted = await restartFromStorage(dir, acl);
        dirs.push(restarted.dir);
        servers.push(restarted.server);
        const reread = await restarted.server.gridPresentation.readPresentation(UID, PROJECT, "grid-tasks");
        expect(reread.presentation.components.due_date.label).to.equal("期限");
        expect((await readStoredGridAsClient(restarted.dir, "grid-tasks"))!.labels).to.deep.equal({ due_date: "期限" });
    });

    it("confirms an apply only after the production store has acknowledged it", async () => {
        let acknowledged = false;
        const service = serviceWith(async (room, doc) => {
            await realStore(room, doc);
            acknowledged = true;
        });
        const result = await service.updatePresentation(UID, { ...request });
        expect(acknowledged).to.equal(true);
        expect(result.applied).to.equal(true);
        // The production instance is wired to the same storage boundary.
        const next = await server.gridPresentation.updatePresentation(UID, {
            ...request,
            expectedPresentationRevision: result.presentationRevision,
            changes: { name: "Stored" },
        });
        expect(next.applied).to.equal(true);
        const restarted = await restartFromStorage(dir, acl);
        dirs.push(restarted.dir);
        servers.push(restarted.server);
        const reread = await restarted.server.gridPresentation.readPresentation(UID, PROJECT, "grid-tasks");
        expect(reread.presentationRevision).to.equal(next.presentationRevision);
    });
});
