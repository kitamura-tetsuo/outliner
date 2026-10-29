import { expect } from "chai";
import * as Y from "yjs";
import {
    applyKanbanUpdates,
    createKanbanEntry,
    getKanbanDefinitionTarget,
} from "../../shared/src/services/kanbanDefinition.js";
import { createDocumentLoader } from "../src/persistence.js";
import { Project } from "../src/schema/app-schema.js";
import { PROJECT, startMcpTestServer, UID } from "./mcp-create-table-fixture.js";
import { withRoom } from "./server-create-table-fixture.js";

describe("Kanban outline card mutations through authenticated HTTP", function() {
    this.timeout(120_000);

    for (
        const [field, value, allDay] of [
            ["start_on", "2026-11-01", true],
            ["start_at", "2026-11-01T10:00:00Z", false],
        ] as const
    ) {
        it(`writes ${field} with its coupled allDay value`, async () => {
            const fixture = await startMcpTestServer();
            try {
                const key = await seedOutlineBoard(fixture.server.hocuspocus);
                await withRoom(fixture.server.hocuspocus, `projects/${PROJECT}`, doc => {
                    applyKanbanUpdates(getKanbanDefinitionTarget(doc, "outline-board")!, {
                        query: `SELECT id, text, ${field} FROM outline_items WHERE due IS NOT NULL`,
                        detailFields: [field],
                    });
                });
                const read = await query(fixture);
                const result = await fixture.mcp.call(
                    "update_kanban_card",
                    args(read, cardFor(read, key), {
                        outputField: field,
                        value,
                        operationId: `set-${field}`,
                    }),
                );
                expect(result.payload).to.include({ applied: true });
                const stored = await createDocumentLoader(fixture.server.persistence!)(`projects/${PROJECT}`);
                const owner = Project.fromDoc(stored! as never).tree.getNodeValueFromKey(key) as Y.Map<unknown>;
                expect(owner.get("start")).to.equal(value);
                expect(owner.get("allDay")).to.equal(allDay);
            } finally {
                await fixture.stop();
            }
        });
    }

    it("normalizes outline fields and detects coupled physical effects", async () => {
        const fixture = await startMcpTestServer();
        try {
            const key = await seedOutlineBoard(fixture.server.hocuspocus);
            await withRoom(fixture.server.hocuspocus, `projects/${PROJECT}`, doc => {
                applyKanbanUpdates(getKanbanDefinitionTarget(doc, "outline-board")!, {
                    query:
                        "SELECT id, text, tags, done, rrule, start_on, start_at, all_day FROM outline_items WHERE due IS NOT NULL ORDER BY id",
                    detailFields: ["tags", "done", "rrule", "start_on", "start_at", "all_day"],
                });
                const owner = Project.fromDoc(doc).tree.getNodeValueFromKey(key) as Y.Map<unknown>;
                owner.set("done", true);
                owner.set("rrule", "FREQ=DAILY");
                owner.set("allDay", true);
            });
            let serial = 0;
            const update = async (field: string, value: unknown) => {
                const read = await query(fixture);
                return fixture.mcp.call(
                    "update_kanban_card",
                    args(read, cardFor(read, key), {
                        outputField: field,
                        value,
                        operationId: `outline-physical-${serial++}`,
                    }),
                );
            };
            let stores = fixture.kanbanStoreCalls;
            expect((await update("rrule", "FREQ=DAILY")).payload).to.include({ applied: true });
            let owner = await rawOwner(fixture, key);
            expect(owner.get("recurrenceExdate")).to.be.instanceOf(Y.Array);
            expect((owner.get("recurrenceExdate") as Y.Array<unknown>).toArray()).to.deep.equal([]);
            expect(fixture.kanbanStoreCalls - stores).to.equal(1);
            stores = fixture.kanbanStoreCalls;
            expect((await update("rrule", "FREQ=DAILY")).payload).to.include({ applied: false });
            expect(fixture.kanbanStoreCalls).to.equal(stores);
            owner.set("recurrenceExdate", false);
            expect((await update("rrule", "FREQ=DAILY")).payload).to.include({ applied: true });
            expect(owner.get("recurrenceExdate")).to.be.instanceOf(Y.Array);
            const exdates = owner.get("recurrenceExdate") as Y.Array<string>;
            exdates.push(["2026-11-01"]);
            expect((await update("rrule", "FREQ=WEEKLY")).payload).to.include({ applied: true });
            expect(owner.get("recurrenceExdate")).to.equal(exdates);
            expect(exdates.toArray()).to.deep.equal(["2026-11-01"]);
            expect((await update("start_on", "")).payload).to.include({ applied: true });
            owner = await rawOwner(fixture, key);
            expect(owner.has("start")).to.equal(false);
            expect(owner.has("allDay")).to.equal(false);
            owner.set("allDay", false);
            expect((await update("start_at", null)).payload).to.include({ applied: true });
            expect(owner.has("start")).to.equal(false);
            expect(owner.has("allDay")).to.equal(false);
            expect((await update("all_day", "")).payload).to.include({ applied: true });
            expect(owner.get("allDay")).to.equal(false);
            expect((await update("all_day", null)).payload).to.include({ applied: true });
            expect(owner.has("allDay")).to.equal(false);
            expect((await update("done", "")).payload).to.include({ applied: true });
            expect(owner.has("done")).to.equal(false);
            expect((await update("done", false)).payload).to.include({ applied: true });
            expect(owner.get("done")).to.equal(false);
            expect((await update("tags", '[" beta ","initial", "beta", 9]')).payload).to.include({ applied: true });
            expect((owner.get("tags") as Y.Array<string>).toArray()).to.deep.equal(["initial", "beta"]);
            stores = fixture.kanbanStoreCalls;
            expect((await update("tags", ["beta", "initial"])).payload).to.include({ applied: false });
            expect(fixture.kanbanStoreCalls).to.equal(stores);
            expect((await update("tags", true)).payload).to.include({ applied: true });
            expect(owner.has("tags")).to.equal(false);
            expect((await update("tags", ["valid", 1])).payload).to.include({ code: "validation_failed" });
            const stored = await createDocumentLoader(fixture.server.persistence!)(`projects/${PROJECT}`);
            const saved = Project.fromDoc(stored! as never).tree.getNodeValueFromKey(key) as Y.Map<unknown>;
            expect(saved.get("done")).to.equal(false);
            expect(saved.has("tags")).to.equal(false);
            expect(saved.has("start")).to.equal(false);
            expect(saved.has("allDay")).to.equal(false);
            expect(saved.get("recurrenceExdate")).to.be.instanceOf(Y.Array);
            expect((saved.get("recurrenceExdate") as Y.Array<string>).toArray()).to.deep.equal(["2026-11-01"]);
        } finally {
            await fixture.stop();
        }
    });

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
