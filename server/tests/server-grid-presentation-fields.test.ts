import { expect } from "chai";
import fs from "fs-extra";
import * as Y from "yjs";
import { orderColumns, setGridComponentField } from "../../shared/src/services/gridDefinition.js";
import type {
    GridPresentationApplied,
    GridPresentationChanges,
    OutlinerGridPresentationService,
} from "../src/mcp/grid-presentation.js";
import {
    AclStore,
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
} from "./server-grid-presentation-fixture.js";

const UID = "user-1";

// Issue #5435 AS-002: every accepted field, its reset, and effective no-ops,
// observed through the client's normal Grid readers.
describe("Grid presentation update: fields, resets and no-ops (#5435 AS-002)", function() {
    this.timeout(60000);
    let acl: AclStore;
    let server: TestServer;
    let dir: string;
    let service: OutlinerGridPresentationService;

    beforeEach(async () => {
        acl = new AclStore();
        acl.grant("projectUsers", PROJECT, UID);
        dir = tempDir();
        server = await startTestServer(dir, acl);
        service = server.gridPresentation;
        await seedGridProject(server.hocuspocus);
    });

    afterEach(async () => {
        await stopTestServer(server);
        await fs.remove(dir);
    });

    const apply = async (changes: GridPresentationChanges) => {
        const { presentationRevision } = await service.readPresentation(UID, PROJECT, "grid-tasks");
        return await service.updatePresentation(UID, {
            projectId: PROJECT,
            gridId: "grid-tasks",
            expectedPresentationRevision: presentationRevision,
            changes,
        }) as GridPresentationApplied;
    };
    const client = () =>
        withRoom(
            server.hocuspocus,
            `projects/${PROJECT}`,
            doc => readGridAsClient(Y.encodeStateAsUpdate(doc), "grid-tasks")!,
        );

    it("stores the Grid name exactly, including an empty name", async () => {
        expect((await apply({ name: "  週次 タスク  " })).presentation.name).to.equal("  週次 タスク  ");
        expect((await client()).name).to.equal("  週次 タスク  ");
        const cleared = await apply({ name: "" });
        expect(cleared.applied).to.equal(true);
        expect(cleared.presentation.name).to.equal("");
        expect((await client()).name).to.equal("");
    });

    it("sets each component type and clears the override with null", async () => {
        for (const type of ["text", "number", "checkbox", "select", "date"] as const) {
            const result = await apply({ components: { title: { type } } });
            expect(result.presentation.components.title).to.deep.equal({
                label: null,
                type,
                shown: true,
                widthPx: null,
            });
            expect((await client()).types).to.deep.equal({ title: type });
        }
        const reset = await apply({ components: { title: { type: null } } });
        expect(reset.applied).to.equal(true);
        expect(reset.presentation.components.title.type).to.equal(null);
        expect((await client()).types).to.deep.equal({});
    });

    it("trims labels and clears them for null, empty and whitespace-only values", async () => {
        expect((await apply({ components: { title: { label: "　 件名 \n" } } })).presentation.components.title.label)
            .to.equal("件名");
        expect((await client()).labels).to.deep.equal({ title: "件名" });
        for (const clear of [null, "", " \t "]) {
            await apply({ components: { title: { label: "件名" } } });
            const cleared = await apply({ components: { title: { label: clear } } });
            expect(cleared.applied).to.equal(true);
            expect(cleared.presentation.components.title.label).to.equal(null);
            expect((await client()).labels).to.deep.equal({});
        }
    });

    it("hides with shown false and restores with shown true", async () => {
        expect((await apply({ components: { done: { shown: false } } })).presentation.components.done.shown)
            .to.equal(false);
        expect((await client()).hidden).to.deep.equal({ done: true });
        expect((await apply({ components: { done: { shown: true } } })).presentation.components.done.shown)
            .to.equal(true);
        expect((await client()).hidden).to.deep.equal({});
    });

    it("replaces the stored order and restores natural order with an empty array", async () => {
        const ordered = await apply({ columnOrder: ["done", "due_date", "dormant_alias"] });
        expect(ordered.presentation.columnOrder).to.deep.equal(["done", "due_date", "dormant_alias"]);
        expect((await client()).columnOrder).to.deep.equal(["done", "due_date", "dormant_alias"]);
        const natural = await apply({ columnOrder: [] });
        expect(natural.applied).to.equal(true);
        expect(natural.presentation.columnOrder).to.deep.equal([]);
        expect((await client()).columnOrder).to.deep.equal([]);
    });

    it("sets and restores the add-row and delete-confirmation defaults", async () => {
        const changed = await apply({ showAddRowButton: false, confirmRowDelete: true });
        expect(changed.presentation).to.include({ showAddRowButton: false, confirmRowDelete: true });
        expect(await client()).to.include({ showAddRowButton: false, confirmRowDelete: true });
        const restored = await apply({ showAddRowButton: true, confirmRowDelete: false });
        expect(restored.presentation).to.include({ showAddRowButton: true, confirmRowDelete: false });
        expect(await client()).to.include({ showAddRowButton: true, confirmRowDelete: false });
        const entry = await withRoom(
            server.hocuspocus,
            `projects/${PROJECT}`,
            doc => doc.getMap<Y.Map<unknown>>("yjsGrids").get("grid-tasks")!.toJSON(),
        );
        expect(entry).not.to.have.property("showAddRowButton");
        expect(entry).not.to.have.property("confirmRowDelete");
    });

    it("keeps duplicate display labels and literal special keys as exact result names", async () => {
        const keys = ["a.b", "__proto__", "constructor", "toString", "has space"];
        const result = await apply({
            components: Object.fromEntries([
                ["title", { label: "Name" }],
                ["due_date", { label: "Name" }],
                ...keys.map(key => [key, { label: `label ${key}`, shown: false }]),
            ]) as Record<string, { label: string; }>,
        });
        expect(Object.keys(result.presentation.components).sort()).to.deep.equal(
            [...keys, "title", "due_date"].sort(),
        );
        expect(Object.prototype.hasOwnProperty.call(result.presentation.components, "__proto__")).to.equal(true);
        expect(result.presentation.components["__proto__"]).to.deep.equal({
            label: "label __proto__",
            type: null,
            shown: false,
            widthPx: null,
        });
        // The client's normal reader keeps every exact name as an own key,
        // including "__proto__", and never resolves an unconfigured name to an
        // inherited Object.prototype member.
        const read = await client();
        expect(Object.keys(read.labels).sort()).to.deep.equal([...keys, "title", "due_date"].sort());
        expect({ ...read.labels }).to.deep.equal(Object.fromEntries([
            ["title", "Name"],
            ["due_date", "Name"],
            ...keys.map(key => [key, `label ${key}`]),
        ]));
        expect(Object.keys(read.hidden).sort()).to.deep.equal([...keys].sort());
        for (const key of keys) expect(read.hidden[key]).to.equal(true);
        expect(read.labels["valueOf"]).to.equal(undefined);
        expect(read.types["hasOwnProperty"]).to.equal(undefined);
        // Rendering: the hidden special names are filtered out of the display.
        const resultColumns = ["id", ...keys, "title"];
        expect(orderColumns(resultColumns, read.columnOrder).filter(c => read.hidden[c] !== true)).to.deep.equal([
            "id",
            "title",
        ]);

        // Restored, "__proto__" renders with its saved header and type.
        await apply({ components: { ["__proto__"]: { shown: true, type: "number" } } as never });
        const restored = await client();
        expect(restored.hidden["__proto__"]).to.equal(undefined);
        expect(restored.labels["__proto__"]).to.equal("label __proto__");
        expect(restored.types["__proto__"]).to.equal("number");
        expect(orderColumns(resultColumns, restored.columnOrder).filter(c => restored.hidden[c] !== true))
            .to.deep.equal(["id", "__proto__", "title"]);
        // The same holds for a fresh client reading acknowledged storage.
        const stored = (await readStoredGridAsClient(dir, "grid-tasks"))!;
        expect(stored.labels["__proto__"]).to.equal("label __proto__");
        expect(stored.types["__proto__"]).to.equal("number");
        expect(stored.hidden["__proto__"]).to.equal(undefined);
        // Nothing was interpreted as a nested object path.
        const components = await withRoom(
            server.hocuspocus,
            `projects/${PROJECT}`,
            doc =>
                [...(doc.getMap<Y.Map<unknown>>("yjsGrids").get("grid-tasks")!.get("components") as Y.Map<unknown>)
                    .keys()]
                    .sort(),
        );
        expect(components).to.deep.equal([...keys, "title", "due_date"].sort());
    });

    it("preserves other known and unknown fields of the same component map", async () => {
        const browser = await Peer.connect(server.hocuspocus);
        setGridComponentField(browser.grid("grid-tasks"), "due_date", "type", "date");
        (browser.grid("grid-tasks").components.get("due_date") as Y.Map<unknown>).set("width", 120);
        await browser.disconnect();

        await apply({ components: { due_date: { label: "期限", shown: false } } });
        const cleared = await apply({ components: { due_date: { label: null, shown: true } } });
        expect(cleared.presentation.components.due_date).to.deep.equal(
            { label: null, type: "date", shown: true, widthPx: null },
        );
        const stored = await withRoom(
            server.hocuspocus,
            `projects/${PROJECT}`,
            doc =>
                (doc.getMap<Y.Map<unknown>>("yjsGrids").get("grid-tasks")!.get("components") as Y.Map<unknown>)
                    .toJSON(),
        );
        expect(stored).to.deep.equal({ due_date: { type: "date", width: 120 } });
        expect((await client()).types).to.deep.equal({ due_date: "date" });
    });

    it("treats already-effective defaults and absent overrides as no-ops without a document update", async () => {
        const recorder = await recordUpdates(server.hocuspocus);
        try {
            const before = await service.readPresentation(UID, PROJECT, "grid-tasks");
            const noop = await service.updatePresentation(UID, {
                projectId: PROJECT,
                gridId: "grid-tasks",
                expectedPresentationRevision: before.presentationRevision,
                changes: {
                    name: "Tasks",
                    columnOrder: [],
                    showAddRowButton: true,
                    confirmRowDelete: false,
                    components: { title: { label: null, type: null, shown: true }, absent: { label: "  " } },
                },
            }) as GridPresentationApplied;
            expect(noop).to.deep.equal({
                dryRun: false,
                applied: false,
                projectId: PROJECT,
                gridId: "grid-tasks",
                priorPresentationRevision: before.presentationRevision,
                presentationRevision: before.presentationRevision,
                presentation: before.presentation,
            });
            expect(recorder.updates).to.have.length(0);
            expect((await service.readPresentation(UID, PROJECT, "grid-tasks")).presentationRevision)
                .to.equal(before.presentationRevision);
        } finally {
            await recorder.stop();
        }
    });
});
