import { Hocuspocus } from "@hocuspocus/server";
import { expect } from "chai";
import * as Y from "yjs";
import { createKanbanEntry, getKanbanDefinitionTarget } from "../../shared/src/services/kanbanDefinition.js";
import {
    adoptKanbanObservationLease,
    KanbanObservationError,
    KanbanObservationService,
    type KanbanObservationServiceOptions,
} from "../src/mcp/kanban-observations.js";
import { openLiveRoom } from "../src/mcp/live-room.js";

describe("Kanban observation live-room lifecycle bounds", function() {
    this.timeout(30_000);

    async function capture(host: Hocuspocus, service: KanbanObservationService, room: string, uid = "u") {
        const connection = await openLiveRoom(host, room, uid, { test: "capacity" });
        const doc = connection.document as unknown as Y.Doc;
        createKanbanEntry(doc, "k");
        return {
            connection,
            result: service.capture({
                uid,
                projectId: room,
                kanbanId: "k",
                lease: adoptKanbanObservationLease(host, connection),
                definition: { target: getKanbanDefinitionTarget(doc, "k")!, keys: [] },
            }),
        };
    }

    it("expires an in-flight guard and releases the real direct connection", async () => {
        const host = new Hocuspocus({ name: "kanban-expiry-test", quiet: true });
        const service = new KanbanObservationService(host, { ttlMs: 15 });
        const { connection, result } = await capture(host, service, "projects/p");
        if (!result.available) throw new Error(result.reason);
        const guard = service.acquire("u", "projects/p", result.observationToken);
        await new Promise(resolve => setTimeout(resolve, 30));
        expect(() => guard.assertCurrent({ kind: "definition", kanbanId: "k", keys: [] })).to.throw(
            KanbanObservationError,
            "observation_expired",
        );
        expect(connection.document).to.equal(null);
        await service.dispose();
        host.closeConnections();
    });

    for (
        const [name, limits] of [
            ["per-owner/project token", { perOwnerProject: 1 }],
            ["total token", { tokens: 1 }],
            ["adopted lease", { leases: 1 }],
        ] as const
    ) {
        it(`refuses the ${name} boundary without adopting or evicting`, async () => {
            const host = new Hocuspocus({ name: `kanban-${name}-test`, quiet: true });
            const service = new KanbanObservationService(host, { limits });
            const first = await capture(host, service, "projects/p");
            if (!first.result.available) throw new Error(first.result.reason);
            const secondConnection = await openLiveRoom(host, "projects/q", "u", { test: "refused" });
            const secondDoc = secondConnection.document as unknown as Y.Doc;
            createKanbanEntry(secondDoc, "k");
            const second = service.capture({
                uid: "u",
                projectId: name.startsWith("per-owner") ? "projects/p" : "projects/q",
                kanbanId: "k",
                lease: adoptKanbanObservationLease(host, secondConnection),
                definition: { target: getKanbanDefinitionTarget(secondDoc, "k")!, keys: [] },
            });
            expect(second).to.deep.equal({ available: false, reason: "capacity" });
            expect(secondConnection.document).not.to.equal(null);
            service.acquire("u", "projects/p", first.result.observationToken).assertCurrent({
                kind: "definition",
                kanbanId: "k",
                keys: [],
            });
            await secondConnection.disconnect();
            await service.dispose();
            host.closeConnections();
        });
    }

    it("enforces per-token and total scope bounds and restores capacity after release", async () => {
        const host = new Hocuspocus({ name: "kanban-scope-test", quiet: true });
        const options: KanbanObservationServiceOptions = { limits: { scopesPerToken: 1, scopes: 1 } };
        const service = new KanbanObservationService(host, options);
        const tooLargeConnection = await openLiveRoom(host, "projects/large", "u", { test: "large" });
        const tooLargeDoc = tooLargeConnection.document as unknown as Y.Doc;
        createKanbanEntry(tooLargeDoc, "k");
        const tooLarge = {
            connection: tooLargeConnection,
            result: service.capture({
                uid: "u",
                projectId: "large",
                kanbanId: "k",
                lease: adoptKanbanObservationLease(host, tooLargeConnection),
                definition: { target: getKanbanDefinitionTarget(tooLargeDoc, "k")!, keys: ["name"] },
            }),
        };
        expect(tooLarge.result).to.deep.equal({ available: false, reason: "capacity" });
        await tooLarge.connection.disconnect();

        const connection = await openLiveRoom(host, "projects/p", "u", { test: "one-scope" });
        const doc = connection.document as unknown as Y.Doc;
        const row = new Y.Map<unknown>();
        row.set("field", "value");
        doc.getMap("rows").set("r", row);
        const accepted = service.capture({
            uid: "u",
            projectId: "p",
            kanbanId: "k",
            lease: adoptKanbanObservationLease(host, connection),
            tableFields: [{ scopeId: "r:field", owner: row, field: "field" }],
        });
        if (!accepted.available) throw new Error(accepted.reason);
        await service.release(accepted.observationToken);
        const afterConnection = await openLiveRoom(host, "projects/after", "u", { test: "after-release" });
        const afterDoc = afterConnection.document as unknown as Y.Doc;
        const afterRow = new Y.Map<unknown>();
        afterRow.set("field", "value");
        afterDoc.getMap("rows").set("r", afterRow);
        const afterRelease = service.capture({
            uid: "u",
            projectId: "after",
            kanbanId: "k",
            lease: adoptKanbanObservationLease(host, afterConnection),
            tableFields: [{ scopeId: "r:field", owner: afterRow, field: "field" }],
        });
        expect(afterRelease.available).to.equal(true);
        await service.dispose();
        host.closeConnections();
    });
});
