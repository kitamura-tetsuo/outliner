import { expect } from "chai";
import fs from "fs-extra";
import * as Y from "yjs";
import { orderColumns, setGridQuery } from "../../shared/src/services/gridDefinition.js";
import type { GridPresentationApplied, GridPresentationChanges } from "../src/mcp/grid-presentation.js";
import {
    AclStore,
    startTestServer,
    stopTestServer,
    tempDir,
    type TestServer,
    withRoom,
} from "./server-create-table-fixture.js";
import { Peer, PROJECT, readGridAsClient, seedGridProject, tableState } from "./server-grid-presentation-fixture.js";

const UID = "user-1";
const ROOM = `projects/${PROJECT}`;
const WITH_ALIAS = "SELECT id, title, length(title) AS title_len, due_date FROM tasks";
const WITHOUT_ALIAS = "SELECT id, title, due_date FROM tasks";

/**
 * What the client renders for a query result: the normal readers' settings
 * applied by the shared production `orderColumns` and the hidden filter, with
 * a nonempty label as header text and the result name as column identity.
 */
function rendered(resultColumns: string[], grid: NonNullable<ReturnType<typeof readGridAsClient>>) {
    return orderColumns(resultColumns, grid.columnOrder)
        .filter(column => grid.hidden[column] !== true)
        .map(column => ({ column, header: grid.labels[column] || column }));
}

// Issue #5435 AS-003: column settings are saved preferences keyed by exact
// result name. They stay dormant while the query omits that name, apply again
// when it returns, are never inherited by label, and saving them neither runs
// SQL nor claims the column renders.
describe("Grid presentation update: dormant preferences (#5435 AS-003)", function() {
    this.timeout(60000);
    let acl: AclStore;
    let server: TestServer;
    let dir: string;
    let peer: Peer;

    beforeEach(async () => {
        acl = new AclStore();
        acl.grant("projectUsers", PROJECT, UID);
        dir = tempDir();
        server = await startTestServer(dir, acl);
        await seedGridProject(server.hocuspocus);
        peer = await Peer.connect(server.hocuspocus);
    });

    afterEach(async () => {
        await peer.disconnect();
        await stopTestServer(server);
        await fs.remove(dir);
    });

    const apply = async (changes: GridPresentationChanges) => {
        const service = server.gridPresentation;
        const { presentationRevision } = await service.readPresentation(UID, PROJECT, "grid-tasks");
        return await service.updatePresentation(UID, {
            projectId: PROJECT,
            gridId: "grid-tasks",
            expectedPresentationRevision: presentationRevision,
            changes,
        }) as GridPresentationApplied;
    };
    const client = () =>
        withRoom(server.hocuspocus, ROOM, doc => readGridAsClient(Y.encodeStateAsUpdate(doc), "grid-tasks")!);

    it("keeps alias preferences dormant while the alias is absent and applies them when it returns", async () => {
        setGridQuery(peer.grid("grid-tasks"), WITH_ALIAS);
        await apply({
            components: { title_len: { label: "文字数" }, title: { shown: false } },
            columnOrder: ["title_len", "due_date"],
        });
        const aliasResult = ["id", "title", "title_len", "due_date"];
        expect(rendered(aliasResult, await client())).to.deep.equal([
            { column: "title_len", header: "文字数" },
            { column: "due_date", header: "due_date" },
            { column: "id", header: "id" },
        ]);

        // The production query editor drops the alias.
        setGridQuery(peer.grid("grid-tasks"), WITHOUT_ALIAS);
        const dormant = await client();
        expect(dormant.labels).to.deep.equal({ title_len: "文字数" });
        expect(dormant.columnOrder).to.deep.equal(["title_len", "due_date"]);
        const plainResult = ["id", "title", "due_date"];
        // Only present names render; no physical column inherits the alias label.
        expect(rendered(plainResult, dormant)).to.deep.equal([
            { column: "due_date", header: "due_date" },
            { column: "id", header: "id" },
        ]);

        // A dormant preference can still be edited without the alias present.
        await apply({ components: { title_len: { label: "長さ" } } });

        setGridQuery(peer.grid("grid-tasks"), WITH_ALIAS);
        expect(rendered(aliasResult, await client())).to.deep.equal([
            { column: "title_len", header: "長さ" },
            { column: "due_date", header: "due_date" },
            { column: "id", header: "id" },
        ]);
        // Neither the query text nor the alias was rewritten.
        expect((await client()).query).to.equal(WITH_ALIAS);
    });

    it("saves configuration with an invalid query and an unavailable source Table, without running SQL", async () => {
        const table = await tableState(server.hocuspocus);
        // A broken query and a temporarily missing source registry entry.
        peer.grid("grid-tasks").entry.set("query", "SELEC broken FROM nowhere");
        const source = peer.doc.getMap<Y.Map<unknown>>("yjsTables").get("table-tasks")!.clone();
        peer.doc.getMap("yjsTables").delete("table-tasks");

        const renamed = await apply({ name: "Broken but named" });
        expect(renamed.applied).to.equal(true);
        const labelled = await apply({
            components: { ghost_alias: { label: "幽霊" } },
            columnOrder: ["ghost_alias", "title"],
        });
        expect(labelled.applied).to.equal(true);
        // The result describes saved configuration only: no rendered columns,
        // result rows, or query validation outcome.
        expect(Object.keys(labelled).sort()).to.deep.equal([
            "applied",
            "dryRun",
            "gridId",
            "presentation",
            "presentationRevision",
            "priorPresentationRevision",
            "projectId",
        ]);
        const read = await server.gridPresentation.readPresentation(UID, PROJECT, "grid-tasks");
        expect(read.query).to.equal("SELEC broken FROM nowhere");
        expect(read.sourceTableId).to.equal("table-tasks");
        expect(read.presentation.components.ghost_alias).to.deep.equal({ label: "幽霊", type: null, shown: true });
        // Nothing repaired the source or touched the Table room.
        expect(await withRoom(server.hocuspocus, ROOM, doc => doc.getMap("yjsTables").has("table-tasks"))).to.equal(
            false,
        );
        expect(await tableState(server.hocuspocus)).to.deep.equal(table);

        peer.doc.getMap("yjsTables").set("table-tasks", source);
        // With a dormant name in the order, only present names render, then
        // unmentioned result names in result order.
        expect(rendered(["id", "title", "due_date", "done"], await client()).map(c => c.column)).to.deep.equal([
            "title",
            "id",
            "due_date",
            "done",
        ]);
    });
});
