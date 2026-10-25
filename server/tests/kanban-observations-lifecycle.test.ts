import { expect } from "chai";
import * as Y from "yjs";
import { createKanbanEntry, getKanbanDefinitionTarget } from "../../shared/src/services/kanbanDefinition.js";
import { KanbanObservationError, KanbanObservationService } from "../src/mcp/kanban-observations.js";

describe("KanbanObservationService lifecycle", () => {
    it("expires without another request and releases an adopted lease once", async () => {
        const doc = new Y.Doc();
        createKanbanEntry(doc, "k", { name: "Board" });
        const host = {
            documents: new Map([["projects/p", doc]]),
            openDirectConnection: async () => undefined as never,
        };
        let releases = 0;
        const service = new KanbanObservationService(host, { ttlMs: 15 });
        const captured = service.capture({
            uid: "u",
            projectId: "p",
            kanbanId: "k",
            lease: { projectDoc: doc, rooms: [{ room: "projects/p", doc }], release: async () => void releases++ },
            definition: { target: getKanbanDefinitionTarget(doc, "k")!, keys: [] },
        });
        expect(captured.available).to.equal(true);
        if (!captured.available) return;
        await new Promise(resolve => setTimeout(resolve, 30));
        expect(releases).to.equal(1);
        expect(() => service.acquire("u", "p", captured.observationToken)).to.throw(
            KanbanObservationError,
            "observation_unavailable",
        );
        await service.dispose();
        expect(releases).to.equal(1);
    });

    it("refuses capacity before adopting the incoming lease", async () => {
        const doc = new Y.Doc();
        createKanbanEntry(doc, "k", { name: "Board" });
        const host = {
            documents: new Map([["projects/p", doc]]),
            openDirectConnection: async () => undefined as never,
        };
        const service = new KanbanObservationService(host, { limits: { tokens: 0 } });
        let releases = 0;
        const captured = service.capture({
            uid: "u",
            projectId: "p",
            kanbanId: "k",
            lease: { projectDoc: doc, rooms: [{ room: "projects/p", doc }], release: async () => void releases++ },
            definition: { target: getKanbanDefinitionTarget(doc, "k")!, keys: [] },
        });
        expect(captured).to.deep.equal({ available: false, reason: "capacity" });
        expect(releases).to.equal(0);
        await service.dispose();
    });
});
