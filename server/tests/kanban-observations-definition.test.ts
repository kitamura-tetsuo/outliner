import { expect } from "chai";
import * as Y from "yjs";
import { createKanbanEntry, getKanbanDefinitionTarget } from "../../shared/src/services/kanbanDefinition.js";
import {
    KanbanObservationError,
    type KanbanObservationLease,
    KanbanObservationService,
} from "../src/mcp/kanban-observations.js";

function fixture(keys: readonly ("name" | "laneOrder")[] = ["name"]) {
    const doc = new Y.Doc();
    doc.guid = "projects/p1";
    createKanbanEntry(doc, "k1", { name: "Board", laneOrder: ["todo"] });
    const host = { documents: new Map([[doc.guid, doc]]), openDirectConnection: async () => undefined as never };
    let releases = 0;
    const lease: KanbanObservationLease = {
        projectDoc: doc,
        rooms: [{ room: doc.guid, doc }],
        release: async () => {
            releases++;
        },
    };
    const service = new KanbanObservationService(host);
    const target = getKanbanDefinitionTarget(doc, "k1")!;
    const result = service.capture({ uid: "u1", projectId: "p1", kanbanId: "k1", lease, definition: { target, keys } });
    if (!result.available) throw new Error(result.reason);
    return { doc, service, target, token: result.observationToken, releases: () => releases };
}

describe("KanbanObservationService definition scopes", () => {
    it("keeps unselected keys usable and detects selected-key ABA", async () => {
        const f = fixture(["laneOrder"]);
        f.target.entry.set("name", "Renamed");
        f.service.acquire("u1", "p1", f.token).assertCurrent({
            kind: "definition",
            kanbanId: "k1",
            keys: ["laneOrder"],
        });
        f.target.entry.set("laneOrder", ["done"]);
        f.target.entry.set("laneOrder", ["todo"]);
        expect(() =>
            f.service.acquire("u1", "p1", f.token).assertCurrent({
                kind: "definition",
                kanbanId: "k1",
                keys: ["laneOrder"],
            })
        ).to.throw(KanbanObservationError, "observation_changed");
        await f.service.dispose();
        expect(f.releases()).to.equal(1);
    });

    it("rejects replacement and does not disclose scopes across owners", async () => {
        const f = fixture([]);
        expect(() => f.service.acquire("another-user", "p1", f.token)).to.throw(
            KanbanObservationError,
            "observation_unavailable",
        );
        f.doc.getMap("yjsKanbans").delete("k1");
        createKanbanEntry(f.doc, "k1", { name: "Board" });
        expect(() =>
            f.service.acquire("u1", "p1", f.token).assertCurrent({
                kind: "definition",
                kanbanId: "k1",
                keys: [],
            })
        ).to.throw(KanbanObservationError, "observation_changed");
        await f.service.dispose();
    });
});
