import { expect } from "chai";
import fs from "fs-extra";
import * as Y from "yjs";
import {
    getGridColumnWidth,
    setGridColumnWidth,
    setGridComponentField,
} from "../../shared/src/services/gridDefinition.js";
import {
    type GridPresentationApplied,
    GridPresentationEffectError,
    OutlinerGridPresentationService,
} from "../src/mcp/grid-presentation.js";
import { OutlinerReadService } from "../src/mcp/outliner-read-service.js";
import { createDocumentStore } from "../src/persistence.js";
import {
    AclStore,
    deferred,
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
    recordUpdates,
    seedGridProject,
    tableState,
} from "./server-grid-presentation-fixture.js";

const UID = "user-1";
const ROOM = `projects/${PROJECT}`;

// Issue #5456: saved column widths are part of the existing Grid presentation
// snapshot and its revision. Grids are created and width-edited through the
// browser's normal shared writers on a connected peer; every observation
// crosses the real domain operation, the current get_grid read, production
// persistence, and fresh normal readers.
describe("Grid presentation snapshots include saved widths (#5456)", function() {
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

    const service = () => server.gridPresentation;
    const reads = () => new OutlinerReadService(server.hocuspocus, acl.checkAccess, async () => []);
    const liveGrid = (gridId = "grid-tasks") =>
        withRoom(server.hocuspocus, ROOM, doc => readGridAsClient(Y.encodeStateAsUpdate(doc), gridId)!);

    it("AS-001: a width-only edit changes the presentation token, not the query revision", async () => {
        const tableBefore = await tableState(server.hocuspocus);
        const before = await service().readPresentation(UID, PROJECT, "grid-tasks");
        const queryBefore = (await reads().getGrid(UID, PROJECT, "grid-tasks")).revision as string;
        expect(before.presentation.components).to.deep.equal({});

        const browser = await Peer.connect(server.hocuspocus);
        setGridColumnWidth(browser.grid("grid-tasks"), "title", 180);
        await browser.disconnect();

        // Observable barrier: the width leaf is in the authoritative room.
        expect({ ...(await liveGrid()).widths }).to.deep.equal({ title: 180 });
        const after = await service().readPresentation(UID, PROJECT, "grid-tasks");
        expect(after.presentation.components.title).to.deep.equal(
            { label: null, type: null, shown: true, widthPx: 180 },
        );
        expect(after.presentationRevision).to.match(/^grid-presentation-v1:/).and.not.equal(
            before.presentationRevision,
        );

        const grid = await reads().getGrid(UID, PROJECT, "grid-tasks");
        expect((grid.components as Record<string, Record<string, unknown>>).title).to.deep.equal(
            { shown: true, widthPx: 180 },
        );
        expect(grid.revision).to.equal(queryBefore);

        // A label patch against the old token is stale and changes nothing.
        const recorder = await recordUpdates(server.hocuspocus);
        try {
            const stale = await rejection(
                service().updatePresentation(UID, {
                    projectId: PROJECT,
                    gridId: "grid-tasks",
                    expectedPresentationRevision: before.presentationRevision,
                    changes: { components: { title: { label: "件名" } } },
                }),
            );
            expect(stale.code).to.equal("stale_revision");
            expect(recorder.updates).to.have.length(0);
        } finally {
            await recorder.stop();
        }
        expect((await liveGrid()).labels).to.deep.equal({});
        expect({ ...(await liveGrid()).widths }).to.deep.equal({ title: 180 });

        // Clearing the width to auto is reflected without touching query or Table state.
        const clearer = await Peer.connect(server.hocuspocus);
        setGridColumnWidth(clearer.grid("grid-tasks"), "title", undefined);
        await clearer.disconnect();
        const cleared = await service().readPresentation(UID, PROJECT, "grid-tasks");
        // The browser width reset removes only the width leaf and retains the
        // component map, so the saved entry still projects with auto width.
        expect(cleared.presentation.components).to.deep.equal({
            title: { label: null, type: null, shown: true, widthPx: null },
        });
        expect(cleared.presentationRevision).to.not.equal(after.presentationRevision);
        expect((await reads().getGrid(UID, PROJECT, "grid-tasks")).revision).to.equal(queryBefore);
        expect((await liveGrid()).query).to.equal("SELECT id, title, due_date, done FROM tasks");
        expect(await tableState(server.hocuspocus)).to.deep.equal(tableBefore);
    });

    it("AS-002: a width delivered while paused invalidates the request; disjoint edits do not", async () => {
        const peer = await Peer.connect(server.hocuspocus);
        try {
            const { presentationRevision: r } = await service().readPresentation(UID, PROJECT, "grid-tasks");
            const reached = deferred();
            const resume = deferred();
            // An otherwise no-op request: the name already equals the current one.
            const pending = service().updatePresentation(UID, {
                projectId: PROJECT,
                gridId: "grid-tasks",
                expectedPresentationRevision: r,
                changes: { name: "Tasks" },
            }, {
                beforeMutation: async () => {
                    reached.resolve();
                    await resume.promise;
                },
            });
            await reached.promise;
            setGridColumnWidth(peer.grid("grid-tasks"), "title", 180);
            expect({ ...(await liveGrid()).widths }).to.deep.equal({ title: 180 });
            resume.resolve();
            const error = await rejection(pending);
            expect(error.code).to.equal("stale_revision");
            expect(error.debug).to.include({ effect: "none" });
            const current = await service().readPresentation(UID, PROJECT, "grid-tasks");
            expect(error.debug).to.include({ currentPresentationRevision: current.presentationRevision });
            expect({ ...(await liveGrid()).widths }).to.deep.equal({ title: 180 });

            // Only Table-record, Page and other-Grid activity: the token stays valid.
            const r2 = current.presentationRevision;
            const reached2 = deferred();
            const resume2 = deferred();
            const pending2 = service().updatePresentation(UID, {
                projectId: PROJECT,
                gridId: "grid-tasks",
                expectedPresentationRevision: r2,
                changes: { components: { due_date: { label: "期限" } } },
            }, {
                beforeMutation: async () => {
                    reached2.resolve();
                    await resume2.promise;
                },
            });
            await reached2.promise;
            await withRoom(server.hocuspocus, `${ROOM}/tables/table-tasks`, doc => {
                (doc.getMap("data").get("r1") as Y.Map<unknown>).set("title", "Edited row");
            });
            setGridComponentField(peer.grid("grid-separate"), "title", "label", "Other label");
            peer.project.addPage("Peer page", "peer");
            expect((await service().readPresentation(UID, PROJECT, "grid-tasks")).presentationRevision).to.equal(r2);
            resume2.resolve();
            const applied = await pending2 as GridPresentationApplied;
            expect(applied).to.include({ applied: true, priorPresentationRevision: r2 });
            expect((await liveGrid()).labels).to.deep.equal({ due_date: "期限" });
            expect({ ...(await liveGrid()).widths }).to.deep.equal({ title: 180 });
            expect((await liveGrid("grid-separate")).labels).to.deep.equal({ title: "Other label" });

            // A deleted target is not_found without recreation.
            const r3 = applied.presentationRevision;
            const reached3 = deferred();
            const resume3 = deferred();
            const pending3 = service().updatePresentation(UID, {
                projectId: PROJECT,
                gridId: "grid-tasks",
                expectedPresentationRevision: r3,
                changes: { components: { title: { label: "件名" } } },
            }, {
                beforeMutation: async () => {
                    reached3.resolve();
                    await resume3.promise;
                },
            });
            await reached3.promise;
            peer.doc.getMap("yjsGrids").delete("grid-tasks");
            expect(await liveGrid()).to.equal(undefined);
            resume3.resolve();
            const gone = await rejection(pending3);
            expect(gone.code).to.equal("not_found");
            expect(await liveGrid()).to.equal(undefined);
        } finally {
            await peer.disconnect();
        }
    });

    it("AS-003: non-width resets retain widths; malformed widths read as auto", async () => {
        const browser = await Peer.connect(server.hocuspocus);
        setGridColumnWidth(browser.grid("grid-tasks"), "title", 180);
        setGridComponentField(browser.grid("grid-tasks"), "title", "label", "件名");
        setGridComponentField(browser.grid("grid-tasks"), "title", "type", "text");
        setGridComponentField(browser.grid("grid-tasks"), "title", "hidden", true);
        // Dormant exact result name with width alongside other settings.
        setGridColumnWidth(browser.grid("grid-tasks"), "ghost", 64);
        setGridComponentField(browser.grid("grid-tasks"), "ghost", "label", "幽霊");
        // Literal special-property names keep exact widths.
        setGridColumnWidth(browser.grid("grid-tasks"), "__proto__", 100);
        await browser.disconnect();

        const before = await service().readPresentation(UID, PROJECT, "grid-tasks");
        expect(before.presentation.components.title).to.deep.equal(
            { label: "件名", type: "text", shown: false, widthPx: 180 },
        );
        expect(before.presentation.components.ghost).to.deep.equal(
            { label: "幽霊", type: null, shown: true, widthPx: 64 },
        );

        // Preview of clearing every non-width setting: the candidate keeps each
        // width, the live component is untouched, and nothing is emitted.
        const recorder = await recordUpdates(server.hocuspocus);
        try {
            const preview = await service().updatePresentation(UID, {
                projectId: PROJECT,
                gridId: "grid-tasks",
                expectedPresentationRevision: before.presentationRevision,
                changes: {
                    components: {
                        title: { label: null, type: null, shown: true },
                        ghost: { label: null },
                    },
                },
                dryRun: true,
            });
            expect(preview.dryRun).to.equal(true);
            if (!preview.dryRun) throw new Error("expected a preview");
            expect(preview.candidatePresentation.components.title).to.deep.equal(
                { label: null, type: null, shown: true, widthPx: 180 },
            );
            expect(preview.candidatePresentation.components.ghost).to.deep.equal(
                { label: null, type: null, shown: true, widthPx: 64 },
            );
            expect(preview.candidatePresentation.components["__proto__"].widthPx).to.equal(100);

            // Canonical no-op with width present emits nothing and reports the width.
            const noop = await service().updatePresentation(UID, {
                projectId: PROJECT,
                gridId: "grid-tasks",
                expectedPresentationRevision: before.presentationRevision,
                changes: { components: { title: { label: "件名" } } },
            }) as GridPresentationApplied;
            expect(noop.applied).to.equal(false);
            expect(noop.presentation.components.title!.widthPx).to.equal(180);
            expect(recorder.updates).to.have.length(0);
        } finally {
            await recorder.stop();
        }

        // Applying the reset keeps the width leaf: the component map survives.
        const cleared = await service().updatePresentation(UID, {
            projectId: PROJECT,
            gridId: "grid-tasks",
            expectedPresentationRevision: before.presentationRevision,
            changes: {
                components: {
                    title: { label: null, type: null, shown: true },
                    ghost: { label: null },
                },
            },
        }) as GridPresentationApplied;
        expect(cleared.applied).to.equal(true);
        expect(cleared.presentation.components.title).to.deep.equal(
            { label: null, type: null, shown: true, widthPx: 180 },
        );
        expect(cleared.presentation.components.ghost!.widthPx).to.equal(64);
        const reread = await Peer.connect(server.hocuspocus);
        try {
            expect(getGridColumnWidth(reread.grid("grid-tasks"), "title")).to.equal(180);
            expect(reread.grid("grid-tasks").components.has("ghost")).to.equal(true);
        } finally {
            await reread.disconnect();
        }

        // Fixed 180 -> 220 -> 180 restores the token; fixed/auto differ.
        const p180 = (await service().readPresentation(UID, PROJECT, "grid-tasks")).presentationRevision;
        const editor = await Peer.connect(server.hocuspocus);
        try {
            setGridColumnWidth(editor.grid("grid-tasks"), "title", 220);
            const p220 = (await service().readPresentation(UID, PROJECT, "grid-tasks")).presentationRevision;
            expect(p220).to.not.equal(p180);
            setGridColumnWidth(editor.grid("grid-tasks"), "title", 180);
            expect((await service().readPresentation(UID, PROJECT, "grid-tasks")).presentationRevision).to.equal(
                p180,
            );
        } finally {
            await editor.disconnect();
        }

        // Malformed storage projects as auto without repair and stays unrepaired.
        await withRoom(server.hocuspocus, ROOM, doc => {
            const entry = doc.getMap<Y.Map<unknown>>("yjsGrids").get("grid-tasks")!;
            const components = entry.get("components") as Y.Map<Y.Map<unknown>>;
            (components.get("title") as Y.Map<unknown>).set("widthPx", "wide");
        });
        const malformed = await service().readPresentation(UID, PROJECT, "grid-tasks");
        expect(malformed.presentation.components.title.widthPx).to.equal(null);
        const grid = await reads().getGrid(UID, PROJECT, "grid-tasks");
        expect((grid.components as Record<string, Record<string, unknown>>).title).to.not.have.property("widthPx");
        const raw = await withRoom(
            server.hocuspocus,
            ROOM,
            doc =>
                ((doc.getMap<Y.Map<unknown>>("yjsGrids").get("grid-tasks")!.get("components") as Y.Map<unknown>)
                    .get("title") as Y.Map<unknown>).get("widthPx"),
        );
        expect(raw).to.equal("wide");

        // The mutation grammar still rejects a width-setting field.
        const widthAttempt = await rejection(
            service().updatePresentation(UID, {
                projectId: PROJECT,
                gridId: "grid-tasks",
                expectedPresentationRevision: malformed.presentationRevision,
                changes: { components: { title: { widthPx: 180 } } } as never,
            }),
        );
        expect(widthAttempt.code).to.equal("invalid_argument");
    });

    it("AS-004: get_grid, restart and uncertain-effect handling preserve widths", async () => {
        const browser = await Peer.connect(server.hocuspocus);
        setGridColumnWidth(browser.grid("grid-tasks"), "title", 180);
        await browser.disconnect();
        expect({ ...(await liveGrid()).widths }).to.deep.equal({ title: 180 });

        // Denied reads disclose no width metadata.
        acl.revokeAll(PROJECT);
        const deniedRead = await rejection(reads().getGrid(UID, PROJECT, "grid-tasks"));
        expect(deniedRead.code).to.equal("forbidden");
        expect(JSON.stringify(deniedRead)).to.not.contain("widthPx");
        const deniedPresentation = await rejection(service().readPresentation(UID, PROJECT, "grid-tasks"));
        expect(deniedPresentation.code).to.equal("forbidden");
        expect(JSON.stringify(deniedPresentation)).to.not.contain("widthPx");
        acl.grant("projectUsers", PROJECT, UID);

        // Acknowledge through production storage, then restart from that storage.
        await withRoom(server.hocuspocus, ROOM, async doc => {
            await createDocumentStore(server.persistence!)(ROOM, doc);
        });
        const expected = await service().readPresentation(UID, PROJECT, "grid-tasks");
        const restarted = await restartFromStorage(dir, acl);
        dirs.push(restarted.dir);
        servers.push(restarted.server);
        const reread = await restarted.server.gridPresentation.readPresentation(UID, PROJECT, "grid-tasks");
        expect(reread.presentationRevision).to.equal(expected.presentationRevision);
        expect(reread.presentation).to.deep.equal(expected.presentation);
        expect(reread.presentation.components.title.widthPx).to.equal(180);
        const stored = await readStoredGridAsClient(restarted.dir, "grid-tasks");
        expect({ ...stored!.widths }).to.deep.equal({ title: 180 });
        expect(stored!.query).to.equal("SELECT id, title, due_date, done FROM tasks");
        const separate = await withRoom(
            restarted.server.hocuspocus,
            ROOM,
            doc => readGridAsClient(Y.encodeStateAsUpdate(doc), "grid-separate")!,
        );
        expect(Object.keys(separate.widths)).to.have.length(0);

        // An uncertain persistence outcome neither erases the width nor reports success.
        const failing = new OutlinerGridPresentationService(
            server.hocuspocus,
            acl.checkAccess,
            async () => {
                throw new Error("acknowledgement lost");
            },
        );
        const prior = await service().readPresentation(UID, PROJECT, "grid-tasks");
        const error = await rejection(failing.updatePresentation(UID, {
            projectId: PROJECT,
            gridId: "grid-tasks",
            expectedPresentationRevision: prior.presentationRevision,
            changes: { components: { due_date: { label: "期限" } } },
        })) as GridPresentationEffectError;
        expect(error).to.be.instanceOf(GridPresentationEffectError);
        expect(error.code).to.equal("internal_failure");
        expect(error.debug).to.include({ applied: null });
        expect({ ...(await liveGrid()).widths }).to.deep.equal({ title: 180 });
        expect((await liveGrid()).labels).to.deep.equal({ due_date: "期限" });
    });
});
