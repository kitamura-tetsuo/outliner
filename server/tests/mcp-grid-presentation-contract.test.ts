import { expect } from "chai";
import * as Y from "yjs";
import { type GridMcpFixture, startGridMcpFixture, updateArgs } from "./mcp-grid-presentation-mcp-fixture.js";
import { withRoom } from "./server-create-table-fixture.js";
import { PROJECT, readGridAsClient, tableState, untouchedState } from "./server-grid-presentation-fixture.js";

// Issue #5436: the MCP presentation contract — tool advertisement, the
// extended get_grid read, and an apply that the normal client observes
// without any data-identity or edit-target change.
describe("MCP grid presentation contract (#5436)", function() {
    this.timeout(60000);
    let t: GridMcpFixture;

    beforeEach(async () => {
        t = await startGridMcpFixture();
    });
    afterEach(async () => {
        await t.stop();
    });

    const liveState = () => withRoom(t.server.hocuspocus, `projects/${PROJECT}`, doc => Y.encodeStateAsUpdate(doc));
    const liveGrid = async () => readGridAsClient(await liveState(), "grid-tasks")!;

    it("advertises update_grid_presentation with scopes, annotations and replay guidance", async () => {
        const listed = (await t.production.rpc("tools/list", {})).tools.find((tool: { name: string; }) =>
            tool.name === "update_grid_presentation"
        );
        expect(listed, "tool must be registered on the production endpoint").to.exist;
        expect([...listed.inputSchema.required].sort()).to.deep.equal([
            "changes",
            "expectedPresentationRevision",
            "gridId",
            "operationId",
            "projectId",
        ]);
        expect(listed.inputSchema.additionalProperties).to.equal(false);
        expect(listed.inputSchema.properties.operationId).to.include({ minLength: 1, maxLength: 200 });
        expect(listed.annotations).to.deep.include({
            readOnlyHint: false,
            destructiveHint: true,
            idempotentHint: true,
        });
        expect(listed._meta.securitySchemes).to.deep.equal([
            { type: "oauth2", scopes: ["outliner.read", "outliner.write"] },
        ]);
        for (const guidance of ["same operationId", "new operationId", "five minutes", "restart", "dryRun"]) {
            expect(listed.description).to.contain(guidance);
        }
    });

    it("extends get_grid with presentation while preserving the query-only revision", async () => {
        const grid = (await t.production.call("get_grid", { projectId: PROJECT, gridId: "grid-tasks" })).payload;
        expect(grid).to.include({
            id: "grid-tasks",
            name: "Tasks",
            query: "SELECT id, title, due_date, done FROM tasks",
            revision: grid.revision,
        });
        expect(grid.presentationRevision).to.match(/^grid-presentation-v1:[0-9a-f]{64}$/);
        expect(grid.presentation).to.deep.equal({
            name: "Tasks",
            columnOrder: [],
            components: {},
            showAddRowButton: true,
            confirmRowDelete: false,
        });
        // The query-only revision keeps its meaning: editing the presentation
        // must not move it.
        const before = grid.revision;
        const applied = await t.production.call(
            "update_grid_presentation",
            updateArgs({
                expectedPresentationRevision: grid.presentationRevision,
                changes: { name: "タスク一覧" },
            }),
        );
        expect(applied.payload).to.include({ applied: true, replayed: false });
        const reread = (await t.production.call("get_grid", { projectId: PROJECT, gridId: "grid-tasks" })).payload;
        expect(reread.revision).to.equal(before);
        expect(reread.presentationRevision).not.to.equal(grid.presentationRevision);
        expect(reread.presentation.name).to.equal("タスク一覧");
    });

    it("applies an MCP edit the normal client observes without touching data identities", async () => {
        const before = await liveState();
        const untouchedBefore = await withRoom(
            t.server.hocuspocus,
            `projects/${PROJECT}`,
            doc => untouchedState(doc, "grid-tasks"),
        );
        const tableBefore = await tableState(t.server.hocuspocus);
        const separateBefore = readGridAsClient(before, "grid-separate");

        const grid = (await t.production.call("get_grid", { projectId: PROJECT, gridId: "grid-tasks" })).payload;
        const changes = {
            name: "タスク",
            columnOrder: ["title", "due_date"],
            components: { title: { label: "件名", type: "text", shown: true }, done: { shown: false } },
            showAddRowButton: false,
            confirmRowDelete: true,
        };
        const { payload } = await t.production.call(
            "update_grid_presentation",
            updateArgs({
                expectedPresentationRevision: grid.presentationRevision,
                changes,
                operationId: "round-trip-1",
            }),
        );
        expect(payload.isError).to.not.equal(true);
        expect(payload).to.include({
            projectId: PROJECT,
            gridId: "grid-tasks",
            dryRun: false,
            applied: true,
            replayed: false,
        });
        expect(payload.priorPresentationRevision).to.equal(grid.presentationRevision);
        expect(payload.presentationRevision).to.match(/^grid-presentation-v1:/);
        expect(payload).not.to.have.property("candidatePresentation");
        expect(payload).not.to.have.property("wouldChange");
        expect(payload.presentation).to.deep.equal({
            name: "タスク",
            columnOrder: ["title", "due_date"],
            components: {
                done: { label: null, type: null, shown: false },
                due_date: { label: null, type: null, shown: true },
                title: { label: "件名", type: "text", shown: true },
            },
            showAddRowButton: false,
            confirmRowDelete: true,
        });

        // get_grid reports the saved configuration, and the normal client
        // readers observe the same definition.
        const reread = (await t.production.call("get_grid", { projectId: PROJECT, gridId: "grid-tasks" })).payload;
        expect(reread.presentation).to.deep.equal(payload.presentation);
        expect(reread.presentationRevision).to.equal(payload.presentationRevision);
        const client = await liveGrid();
        expect(client.name).to.equal("タスク");
        expect(client.columnOrder).to.deep.equal(["title", "due_date"]);
        expect({ ...client.labels }).to.deep.equal({ title: "件名" });
        expect({ ...client.hidden }).to.deep.equal({ done: true });
        expect(client.showAddRowButton).to.equal(false);
        expect(client.confirmRowDelete).to.equal(true);

        // Nothing else moved: query, source table, placements, other grids,
        // Table schema/records and row identities are untouched.
        expect(client.query).to.equal("SELECT id, title, due_date, done FROM tasks");
        expect(client.sourceTableId).to.equal("table-tasks");
        const untouchedAfter = await withRoom(
            t.server.hocuspocus,
            `projects/${PROJECT}`,
            doc => untouchedState(doc, "grid-tasks"),
        );
        expect(untouchedAfter).to.deep.equal(untouchedBefore);
        expect(await tableState(t.server.hocuspocus)).to.deep.equal(tableBefore);
        expect(readGridAsClient(await liveState(), "grid-separate")).to.deep.equal(separateBefore);
    });

    it("previews without persisting and accepts no-ops without a document update", async () => {
        const grid = (await t.mcp.call("get_grid", { projectId: PROJECT, gridId: "grid-tasks" })).payload;
        const before = await liveState();
        const preview = (await t.mcp.call(
            "update_grid_presentation",
            updateArgs({
                expectedPresentationRevision: grid.presentationRevision,
                changes: { components: { title: { label: "件名" } } },
                dryRun: true,
            }),
        )).payload;
        expect(preview).to.include({
            dryRun: true,
            applied: false,
            replayed: false,
            priorPresentationRevision: grid.presentationRevision,
            presentationRevision: grid.presentationRevision,
            wouldChange: true,
        });
        expect(preview.presentation).to.deep.equal(grid.presentation);
        expect(preview.candidatePresentation.components.title).to.deep.equal({
            label: "件名",
            type: null,
            shown: true,
        });
        expect(await liveState()).to.deep.equal(before);

        // A no-op dry run reports no change; an accepted no-op apply reports
        // equal revisions and still writes nothing.
        const noopPreview = (await t.mcp.call(
            "update_grid_presentation",
            updateArgs({
                expectedPresentationRevision: grid.presentationRevision,
                changes: { name: "Tasks" },
                dryRun: true,
            }),
        )).payload;
        expect(noopPreview).to.include({ wouldChange: false });
        expect(noopPreview.candidatePresentation).to.deep.equal(grid.presentation);
        const noop = (await t.mcp.call(
            "update_grid_presentation",
            updateArgs({
                expectedPresentationRevision: grid.presentationRevision,
                changes: { name: "Tasks" },
                operationId: "noop-1",
            }),
        )).payload;
        expect(noop).to.include({ dryRun: false, applied: false, replayed: false });
        expect(noop.priorPresentationRevision).to.equal(grid.presentationRevision);
        expect(noop.presentationRevision).to.equal(grid.presentationRevision);
        expect(noop).not.to.have.property("candidatePresentation");
        expect(await liveState()).to.deep.equal(before);
    });
});
