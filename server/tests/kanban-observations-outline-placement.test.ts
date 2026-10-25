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

    for (
        const field of [
            "id",
            "page_id",
            "parent_id",
            "recurrence_parent_id",
            "recurrence_occurrence_id",
        ]
    ) {
        it(`refuses the structural outline field ${field}`, async () => {
            const host = new Hocuspocus({ name: `kanban-outline-${field}-test`, quiet: true });
            const connection = await openLiveRoom(host, "projects/p", "u", { test: field });
            const project = Project.fromDoc(connection.document as unknown as Y.Doc);
            const item = project.addPage("Page", "u").items.addNode("u");
            const value = project.tree.getNodeValueFromKey(item.key) as Y.Map<unknown>;
            const service = new KanbanObservationService(host);
            const captured = service.capture({
                uid: "u",
                projectId: "p",
                kanbanId: "k",
                lease: adoptKanbanObservationLease(host, connection),
                outlineFields: [{
                    scopeId: `item:${field}`,
                    owner: value,
                    field: field as never,
                    resolveOwner: () => project.tree.getNodeValueFromKey(item.key) as Y.Map<unknown>,
                }],
            });
            expect(captured).to.deep.equal({ available: false, reason: "source_unavailable" });
            // Refusal does not adopt the production connection.
            expect(connection.document).not.to.equal(null);
            await connection.disconnect();
            await service.dispose();
            host.closeConnections();
        });
    }

    it("derives every logical outline column's physical storage plan", async () => {
        const host = new Hocuspocus({ name: "kanban-outline-mapped-fields", quiet: true });
        const connection = await openLiveRoom(host, "projects/p", "u", { test: "mapped-fields" });
        const project = Project.fromDoc(connection.document as unknown as Y.Doc);
        const item = project.addPage("Page", "u").items.addNode("u");
        item.updateText("A");
        item.tags = ["a"];
        item.start = "2026-01-01";
        item.allDay = true;
        item.due = "2026-01-02";
        item.done = false;
        item.duration = "PT1H";
        item.rrule = "FREQ=DAILY";
        item.recurrenceDtstart = "20260101T090000";
        item.recurrenceTimezone = "UTC";
        const value = project.tree.getNodeValueFromKey(item.key) as Y.Map<unknown>;
        const resolve = () => project.tree.getNodeValueFromKey(item.key) as Y.Map<unknown>;
        const fields = [
            "text",
            "tags",
            "start_on",
            "start_at",
            "all_day",
            "due",
            "done",
            "duration",
            "rrule",
            "recurrence_dtstart",
            "recurrence_timezone",
        ] as const;
        const service = new KanbanObservationService(host);
        const captured = service.capture({
            uid: "u",
            projectId: "p",
            kanbanId: "k",
            lease: adoptKanbanObservationLease(host, connection),
            outlineFields: fields.map(field => ({ scopeId: field, owner: value, field, resolveOwner: resolve })),
        });
        if (!captured.available) throw new Error(captured.reason);
        const assertChanged = (field: (typeof fields)[number]) =>
            expect(() =>
                service.acquire("u", "p", captured.observationToken).assertCurrent({
                    kind: "outline-field",
                    kanbanId: "k",
                    scopeId: field,
                })
            ).to.throw(KanbanObservationError, "observation_changed");

        item.componentType = "kanban";
        item.componentType = undefined;
        assertChanged("text");
        item.tags = ["b"];
        item.tags = ["a"];
        assertChanged("tags");
        item.allDay = false;
        item.allDay = true;
        assertChanged("start_on");
        assertChanged("start_at");
        assertChanged("all_day");
        item.due = "2026-01-03";
        item.due = "2026-01-02";
        assertChanged("due");
        item.done = true;
        item.done = false;
        assertChanged("done");
        item.duration = "PT2H";
        item.duration = "PT1H";
        assertChanged("duration");
        item.rrule = "FREQ=WEEKLY";
        item.rrule = "FREQ=DAILY";
        assertChanged("rrule");
        item.recurrenceDtstart = "20260102T090000";
        item.recurrenceDtstart = "20260101T090000";
        assertChanged("recurrence_dtstart");
        item.recurrenceTimezone = "Asia/Tokyo";
        item.recurrenceTimezone = "UTC";
        assertChanged("recurrence_timezone");
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
