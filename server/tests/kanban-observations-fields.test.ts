import { expect } from "chai";
import * as Y from "yjs";
import { KanbanObservationError, KanbanObservationService } from "../src/mcp/kanban-observations.js";

describe("KanbanObservationService physical field scopes", () => {
    it("detects nested ABA and dependencies while ignoring unrelated fields", async () => {
        const project = new Y.Doc();
        const rows = project.getMap<Y.Map<unknown>>("rows");
        const row = new Y.Map<unknown>();
        const text = new Y.Text("A");
        row.set("title", text);
        row.set("other", "untouched");
        rows.set("r1", row);
        const schema = project.getMap<unknown>("schema");
        schema.set("source", "title text");
        const host = {
            documents: new Map([["projects/p", project]]),
            openDirectConnection: async () => undefined as never,
        };
        const service = new KanbanObservationService(host);
        const captured = service.capture({
            uid: "u",
            projectId: "p",
            kanbanId: "k",
            lease: { projectDoc: project, rooms: [{ room: "projects/p", doc: project }], release: async () => {} },
            tableFields: [{
                scopeId: "card:r1:title",
                owner: row,
                field: "title",
                container: rows,
                containerKey: "r1",
                dependencies: [{ owner: schema, fields: ["source"] }],
            }],
        });
        if (!captured.available) throw new Error(captured.reason);
        row.set("other", "changed");
        const selection = { kind: "table-field", kanbanId: "k", scopeId: "card:r1:title" } as const;
        service.acquire("u", "p", captured.observationToken).assertCurrent(selection);
        text.delete(0, 1);
        text.insert(0, "B");
        text.delete(0, 1);
        text.insert(0, "A");
        expect(() => service.acquire("u", "p", captured.observationToken).assertCurrent(selection)).to.throw(
            KanbanObservationError,
            "observation_changed",
        );
        await service.dispose();
    });
});
