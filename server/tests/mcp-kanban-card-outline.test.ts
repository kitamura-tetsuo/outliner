import { expect } from "chai";
import * as Y from "yjs";
import { createKanbanEntry } from "../../shared/src/services/kanbanDefinition.js";
import { createDocumentLoader } from "../src/persistence.js";
import { Project } from "../src/schema/app-schema.js";
import { PROJECT, startMcpTestServer, UID } from "./mcp-create-table-fixture.js";
import { withRoom } from "./server-create-table-fixture.js";

describe("Kanban outline card mutations through authenticated HTTP", function() {
    this.timeout(120_000);

    it("previews, edits text/tags, moves, no-ops, and persists the raw outline owner", async () => {
        const fixture = await startMcpTestServer();
        try {
            const first = await seedOutlineBoard(fixture.server.hocuspocus);
            let read = await query(fixture);
            let card = cardFor(read, first);
            const preview = await fixture.mcp.call(
                "update_kanban_card",
                args(read, card, {
                    outputField: "text",
                    value: "Changed",
                    operationId: "outline-preview",
                    dryRun: true,
                }),
            );
            expect(preview.payload).to.include({ applied: false, dryRun: true, wouldChange: true });
            expect(await rawText(fixture, first)).to.equal("Ready");

            const edit = await fixture.mcp.call(
                "update_kanban_card",
                args(read, card, {
                    outputField: "text",
                    value: "Changed",
                    operationId: "outline-text",
                }),
            );
            expect(edit.payload).to.include({ applied: true, operation: "update" });
            expect(await rawText(fixture, first)).to.equal("Changed");
            expect(await storedText(fixture, first)).to.equal("Changed");

            read = await query(fixture);
            card = cardFor(read, first);
            const tags = await fixture.mcp.call(
                "update_kanban_card",
                args(read, card, {
                    outputField: "tags",
                    value: [" alpha ", "beta", "alpha"],
                    operationId: "outline-tags",
                }),
            );
            expect(tags.payload).to.include({ applied: true });
            expect(await rawTags(fixture, first)).to.deep.equal(["alpha", "beta"]);

            read = await query(fixture);
            card = cardFor(read, first);
            const moved = await fixture.mcp.call(
                "move_kanban_card",
                args(read, card, {
                    destination: "Other",
                    operationId: "outline-move",
                }),
            );
            expect(moved.payload).to.include({ applied: true, operation: "move" });
            expect(await rawText(fixture, first)).to.equal("Other");

            read = await query(fixture);
            card = cardFor(read, first);
            const noOp = await fixture.mcp.call(
                "update_kanban_card",
                args(read, card, {
                    outputField: "text",
                    value: "Other",
                    operationId: "outline-noop",
                }),
            );
            expect(noOp.payload).to.include({ applied: false, dryRun: false });
        } finally {
            await fixture.stop();
        }
    });

    it("refuses an old observation after the raw tree owner is replaced with equal values", async () => {
        const fixture = await startMcpTestServer();
        try {
            const first = await seedOutlineBoard(fixture.server.hocuspocus);
            const read = await query(fixture);
            const card = cardFor(read, first);
            await withRoom(fixture.server.hocuspocus, `projects/${PROJECT}`, doc => {
                const project = Project.fromDoc(doc);
                const old = project.tree.getNodeValueFromKey(first) as Y.Map<unknown>;
                const parent = project.tree.getNodeParentFromKey(first)!;
                const replacement = cloneOutlineOwner(old);
                project.tree.deleteNodeAndDescendants(first);
                project.tree.createNode(parent, first, replacement as never);
            });
            const refused = await fixture.mcp.call(
                "update_kanban_card",
                args(read, card, {
                    outputField: "text",
                    value: "Must not land",
                    operationId: "outline-replaced",
                }),
            );
            expect(refused.result.isError).to.equal(true);
            expect(refused.payload).to.include({ code: "stale_revision" });
            expect(await rawText(fixture, first)).to.equal("Ready");
        } finally {
            await fixture.stop();
        }
    });
});

async function seedOutlineBoard(host: Parameters<typeof withRoom>[0]) {
    let first = "";
    await withRoom(host, `projects/${PROJECT}`, doc => {
        const page = Project.fromDoc(doc).addPage("Outline", UID);
        const ready = page.items.addNode(UID);
        ready.updateText("Ready");
        ready.tags = ["initial"];
        ready.due = "2026-10-27";
        const other = page.items.addNode(UID);
        other.updateText("Other");
        other.due = "2026-10-28";
        first = ready.key;
        createKanbanEntry(doc, "outline-board", {
            name: "Outline board",
            query: "SELECT id, text, tags FROM outline_items WHERE due IS NOT NULL ORDER BY id",
            groupField: "text",
            titleField: "text",
            detailFields: ["tags"],
        });
    });
    return first;
}

const query = async (fixture: Awaited<ReturnType<typeof startMcpTestServer>>) => {
    const response = await fixture.mcp.call("query_kanban", { projectId: PROJECT, kanbanId: "outline-board" });
    expect(response.result.isError, JSON.stringify(response.payload)).not.to.equal(true);
    return response.payload;
};
const cardFor = (read: any, rowId: string) => {
    const card = read.lanes?.flatMap((lane: any) => lane.cards).find((candidate: any) =>
        candidate.sourceRef?.rowId === rowId
    );
    expect(card, JSON.stringify(read)).not.to.equal(undefined);
    return card;
};
const args = (read: any, card: any, specific: Record<string, unknown>) => ({
    projectId: PROJECT,
    kanbanId: "outline-board",
    sourceRef: card.sourceRef,
    observationToken: read.observationToken,
    ...specific,
});

async function rawOwner(fixture: Awaited<ReturnType<typeof startMcpTestServer>>, key: string) {
    const doc = fixture.server.hocuspocus.documents.get(`projects/${PROJECT}`) as Y.Doc;
    return Project.fromDoc(doc).tree.getNodeValueFromKey(key) as Y.Map<unknown>;
}
const rawText = async (fixture: Awaited<ReturnType<typeof startMcpTestServer>>, key: string) =>
    ((await rawOwner(fixture, key)).get("text") as Y.Text).toString();
const rawTags = async (fixture: Awaited<ReturnType<typeof startMcpTestServer>>, key: string) =>
    ((await rawOwner(fixture, key)).get("tags") as Y.Array<string>).toArray();
async function storedText(fixture: Awaited<ReturnType<typeof startMcpTestServer>>, key: string) {
    const stored = await createDocumentLoader(fixture.server.persistence!)(`projects/${PROJECT}`);
    return (Project.fromDoc(stored! as never).tree.getNodeValueFromKey(key).get("text") as Y.Text).toString();
}
function cloneOutlineOwner(source: Y.Map<unknown>) {
    const result = new Y.Map<unknown>();
    for (const [key, value] of source) {
        if (value instanceof Y.Text) {
            const text = new Y.Text();
            text.insert(0, value.toString());
            result.set(key, text);
        } else if (value instanceof Y.Array) {
            const array = new Y.Array<unknown>();
            array.push(value.toArray());
            result.set(key, array);
        } else result.set(key, value);
    }
    return result;
}
