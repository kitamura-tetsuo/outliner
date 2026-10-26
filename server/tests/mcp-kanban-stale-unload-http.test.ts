import { expect } from "chai";
import * as Y from "yjs";
import { createKanbanEntry } from "../../shared/src/services/kanbanDefinition.js";
import { PROJECT, startMcpTestServer, UID } from "./mcp-create-table-fixture.js";
import { withRoom } from "./server-create-table-fixture.js";

describe("Kanban MCP observation across a stale room unload", function() {
    this.timeout(120_000);

    it("retains the new serving room when an old document's deferred unload arrives", async () => {
        const fixture = await startMcpTestServer();
        const room = `projects/${PROJECT}`;
        try {
            const oldDoc = await withRoom(fixture.server.hocuspocus, room, doc => {
                createKanbanEntry(doc, "board", { name: "Current board" });
                return doc;
            });
            for (let attempt = 0; attempt < 100 && fixture.server.hocuspocus.documents.has(room); attempt++) {
                await new Promise(resolve => setTimeout(resolve, 10));
            }
            expect(fixture.server.hocuspocus.documents.has(room), "previous incarnation must have unloaded")
                .to.equal(false);

            const read = await fixture.mcp.call("get_kanban", { projectId: PROJECT, kanbanId: "board" });
            expect(read.result.isError, JSON.stringify(read)).not.to.equal(true);
            expect(read.payload.mutationObservation).to.deep.equal({ available: true });
            const currentDoc = fixture.server.hocuspocus.documents.get(room) as Y.Doc;
            expect(currentDoc).not.to.equal(oldDoc);
            const guard = fixture.server.kanbanObservations.acquire(UID, PROJECT, read.payload.observationToken);
            guard.assertCurrent({ kind: "definition", kanbanId: "board", keys: ["name"] });

            // Hocuspocus schedules another unload after storing an old document.
            // That callback must never evict a different, actively leased one.
            await fixture.server.hocuspocus.unloadDocument(oldDoc as never);
            expect(fixture.server.hocuspocus.documents.get(room)).to.equal(currentDoc);
            guard.assertCurrent({ kind: "definition", kanbanId: "board", keys: ["name"] });
            guard.release();
            await fixture.server.kanbanObservations.release(read.payload.observationToken);
            for (let attempt = 0; attempt < 100 && fixture.server.hocuspocus.documents.has(room); attempt++) {
                await new Promise(resolve => setTimeout(resolve, 10));
            }
            expect(fixture.server.hocuspocus.documents.has(room), "ordinary final release must still unload")
                .to.equal(false);
        } finally {
            await fixture.stop();
        }
    });
});
