import { Hocuspocus } from "@hocuspocus/server";
import { expect } from "chai";
import * as Y from "yjs";
import {
    adoptKanbanObservationLease,
    KanbanObservationError,
    KanbanObservationService,
} from "../src/mcp/kanban-observations.js";
import { openLiveRoom } from "../src/mcp/live-room.js";
import { Project } from "../src/schema/app-schema.js";

describe("Kanban observations over production ordered-tree storage", function() {
    this.timeout(30_000);

    it("tracks nested outline fields independently and rejects text ABA", async () => {
        const host = new Hocuspocus({ name: "kanban-outline-test", quiet: true });
        const connection = await openLiveRoom(host, "projects/p", "u", { test: "outline" });
        const doc = connection.document as unknown as Y.Doc;
        const project = Project.fromDoc(doc);
        const page = project.addPage("Page", "u");
        const item = page.items.addNode("u");
        item.updateText("A");
        const value = project.tree.getNodeValueFromKey(item.key) as Y.Map<unknown>;
        const resolve = () => {
            try {
                return project.tree.getNodeValueFromKey(item.key) as Y.Map<unknown>;
            } catch {
                return undefined;
            }
        };
        const service = new KanbanObservationService(host);
        const captured = service.capture({
            uid: "u",
            projectId: "p",
            kanbanId: "k",
            lease: adoptKanbanObservationLease(host, connection),
            outlineFields: [{ scopeId: "item:text", owner: value, field: "text", resolveOwner: resolve }],
        });
        if (!captured.available) throw new Error(captured.reason);
        value.set("done", true);
        const selection = { kind: "outline-field", kanbanId: "k", scopeId: "item:text" } as const;
        service.acquire("u", "p", captured.observationToken).assertCurrent(selection);
        const text = value.get("text") as Y.Text;
        text.delete(0, 1);
        text.insert(0, "B");
        text.delete(0, 1);
        text.insert(0, "A");
        expect(() => service.acquire("u", "p", captured.observationToken).assertCurrent(selection)).to.throw(
            KanbanObservationError,
            "observation_changed",
        );
        await service.dispose();
        host.closeConnections();
    });

    it("allows reorder but rejects placement binding ABA and deletion", async () => {
        const host = new Hocuspocus({ name: "kanban-placement-test", quiet: true });
        const connection = await openLiveRoom(host, "projects/p", "u", { test: "placement" });
        const project = Project.fromDoc(connection.document as unknown as Y.Doc);
        const page = project.addPage("Page", "u");
        const placement = page.items.addNode("u");
        placement.componentType = "kanban";
        placement.kanbanId = "k";
        const sibling = page.items.addNode("u");
        sibling.componentType = "kanban";
        sibling.kanbanId = "k";
        const value = project.tree.getNodeValueFromKey(placement.key) as Y.Map<unknown>;
        const siblingValue = project.tree.getNodeValueFromKey(sibling.key) as Y.Map<unknown>;
        const resolve = () => {
            try {
                return project.tree.getNodeValueFromKey(placement.key) as Y.Map<unknown>;
            } catch {
                return undefined;
            }
        };
        const service = new KanbanObservationService(host);
        const captured = service.capture({
            uid: "u",
            projectId: "p",
            kanbanId: "k",
            lease: adoptKanbanObservationLease(host, connection),
            placements: [
                { placementId: placement.key, value, resolveValue: resolve },
                {
                    placementId: sibling.key,
                    value: siblingValue,
                    resolveValue: () => project.tree.getNodeValueFromKey(sibling.key) as Y.Map<unknown>,
                },
            ],
        });
        if (!captured.available) throw new Error(captured.reason);
        const selection = { kind: "placement", kanbanId: "k", placementId: placement.key } as const;
        project.tree.setNodeAfter(placement.key, sibling.key);
        service.acquire("u", "p", captured.observationToken).assertCurrent(selection);
        siblingValue.set("kanbanId", "other");
        siblingValue.set("kanbanId", "k");
        const siblingSelection = { kind: "placement", kanbanId: "k", placementId: sibling.key } as const;
        expect(() => service.acquire("u", "p", captured.observationToken).assertCurrent(siblingSelection)).to.throw(
            KanbanObservationError,
            "observation_changed",
        );
        project.tree.deleteNodeAndDescendants(placement.key);
        expect(() => service.acquire("u", "p", captured.observationToken).assertCurrent(selection)).to.throw(
            KanbanObservationError,
            "observation_changed",
        );
        await service.dispose();
        host.closeConnections();
    });
});
