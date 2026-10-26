import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { expect } from "chai";
import * as Y from "yjs";
import { createKanbanEntry } from "../../shared/src/services/kanbanDefinition.js";
import { Project } from "../src/schema/app-schema.js";
import { PROJECT, startMcpTestServer, token, UID } from "./mcp-create-table-fixture.js";
import { withRoom } from "./server-create-table-fixture.js";

describe("Kanban outline source reads through production MCP HTTP", function() {
    this.timeout(120_000);

    it("captures the actual outline field, allows unrelated edits, and rejects source edits and deletion", async () => {
        const fixture = await startMcpTestServer();
        const client = new Client({ name: "kanban-outline-read-test", version: "1.0.0" });
        try {
            let itemKey = "";
            await withRoom(fixture.server.hocuspocus, `projects/${PROJECT}`, doc => {
                const page = Project.fromDoc(doc).addPage("Schedule", UID);
                const item = page.items.addNode(UID);
                item.updateText("Ready");
                item.due = "2026-10-25";
                itemKey = item.key;
                createKanbanEntry(doc, "outline-board", {
                    name: "Outline board",
                    query: "SELECT id, text, text || '!' AS computed FROM outline_items WHERE due IS NOT NULL",
                    groupField: "text",
                    titleField: "text",
                    detailFields: ["computed"],
                });
            });
            const address = fixture.server.server.address() as { port: number; };
            await client.connect(
                new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${address.port}/mcp`), {
                    requestInit: { headers: { Authorization: `Bearer ${token()}` } },
                }),
            );
            const query = async () => {
                const response = await client.callTool({
                    name: "query_kanban",
                    arguments: { projectId: PROJECT, kanbanId: "outline-board" },
                });
                expect(response.isError, JSON.stringify(response)).not.to.equal(true);
                return JSON.parse((response.content as { text: string; }[])[0].text);
            };

            const read = await query();
            expect(read.projection.status).to.equal("success");
            expect(read.mutationObservation).to.deep.equal({ available: true });
            const card = read.lanes.flatMap((lane: { cards: unknown[]; }) => lane.cards)[0];
            expect(card.row).to.include({ id: itemKey, text: "Ready", computed: "Ready!" });
            expect(card.sourceRef).to.deep.equal({
                kind: "system",
                id: "outline_items",
                sqlName: "outline_items",
                rowId: itemKey,
            });
            const liveDoc = fixture.server.hocuspocus.documents.get(`projects/${PROJECT}`) as Y.Doc;
            expect(Project.fromDoc(liveDoc).tree.computedMap?.has(itemKey), "outline row must be attached").to.equal(
                true,
            );
            expect(card.fieldCapabilities, JSON.stringify(card)).to.deep.include({
                outputField: "text",
                updateEligible: true,
            });
            expect(card.fieldCapabilities).to.deep.include({
                outputField: "computed",
                updateEligible: false,
                reason: "computed",
            });
            expect(card.moveCapability).to.deep.equal({ eligible: true });

            const selection = {
                kind: "outline-field",
                kanbanId: "outline-board",
                scopeId: JSON.stringify(["outline_items", itemKey, "text"]),
            } as const;
            const doc = fixture.server.hocuspocus.documents.get(`projects/${PROJECT}`) as Y.Doc;
            const project = Project.fromDoc(doc);
            const value = project.tree.getNodeValueFromKey(itemKey) as Y.Map<unknown>;
            const guard = fixture.server.kanbanObservations.acquire(UID, PROJECT, read.observationToken);
            guard.assertCurrent(selection);
            value.set("done", true);
            guard.assertCurrent(selection);
            (value.get("text") as Y.Text).insert(0, "Now ");
            expect(() => guard.assertCurrent(selection)).to.throw("observation_changed");
            guard.release();
            await fixture.server.kanbanObservations.release(read.observationToken);

            const refreshed = await query();
            expect(refreshed.mutationObservation).to.deep.equal({ available: true });
            const freshGuard = fixture.server.kanbanObservations.acquire(UID, PROJECT, refreshed.observationToken);
            freshGuard.assertCurrent(selection);
            // Releasing the first token can evict its room. The second read
            // retains a new incarnation, so mutate that exact live document.
            const refreshedDoc = fixture.server.hocuspocus.documents.get(`projects/${PROJECT}`) as Y.Doc;
            Project.fromDoc(refreshedDoc).tree.deleteNodeAndDescendants(itemKey);
            expect(refreshedDoc.getMap("orderedTree").has(itemKey), "deleted row must leave the tree").to.equal(
                false,
            );
            expect(() => freshGuard.assertCurrent(selection)).to.throw("observation_changed");
            freshGuard.release();
            await fixture.server.kanbanObservations.release(refreshed.observationToken);
        } finally {
            await client.close();
            await fixture.stop();
        }
    });
});
