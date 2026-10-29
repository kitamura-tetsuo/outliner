import { expect } from "chai";
import sinon from "sinon";
import * as Y from "yjs";
import { createKanbanEntry } from "../../shared/src/services/kanbanDefinition.js";
import { IdempotencyCache } from "../src/mcp/mutation-contract.js";
import { createDocumentLoader } from "../src/persistence.js";
import { auditRecords, deferred, PROJECT, startMcpTestServer, UID } from "./mcp-create-table-fixture.js";
import { restartFromStorage, withRoom } from "./server-create-table-fixture.js";

describe("Kanban card mutation races and effect disclosure", function() {
    this.timeout(120_000);

    it("expires observations and replay retention on their clocks", async () => {
        const clock = sinon.stub(Date, "now").callThrough();
        const fixture = await startMcpTestServer({ controlledObservationClock: true });
        try {
            let observationTime = 0;
            fixture.seams.observationNow = () => observationTime;
            await seed(fixture.server.hocuspocus);
            const { read, card } = await observed(fixture);
            const args = updateArgs(read, card, "timed-replay");
            const first = await fixture.mcp.call("update_kanban_card", args);
            expect(first.payload).to.include({ applied: true });
            const stores = fixture.kanbanStoreCalls;
            const settledAt = Date.now();
            observationTime = 300_001;
            clock.returns(settledAt + 240_000);
            const replay = await fixture.mcp.call("update_kanban_card", args);
            expect(replay.payload).to.include({ applied: true, replayed: true });
            const expired = await fixture.mcp.call("update_kanban_card", { ...args, operationId: "expired" });
            expect(expired.payload).to.include({ code: "stale_revision" });
            clock.returns(settledAt + 300_001);
            const expiredReplay = await fixture.mcp.call("update_kanban_card", args);
            expect(expiredReplay.payload).to.include({ code: "stale_revision" });
            expect(fixture.kanbanStoreCalls).to.equal(stores);
            const persisted = await createDocumentLoader(fixture.server.persistence!)(
                `projects/${PROJECT}/tables/tasks`,
            );
            expect(persisted!.getMap<Y.Map<unknown>>("data").get("r1")!.get("title")).to.equal("Changed");
        } finally {
            clock.restore();
            await fixture.stop();
        }
    });

    it("refuses an observation issued before a storage-backed service restart", async () => {
        const first = await startMcpTestServer();
        let second: Awaited<ReturnType<typeof startMcpTestServer>> | undefined;
        try {
            await seed(first.server.hocuspocus);
            const { read, card } = await observed(first);
            const args = updateArgs(read, card, "old-service");
            expect((await first.mcp.call("update_kanban_card", args)).payload).to.include({ applied: true });
            const restarted = await restartFromStorage(first.dir, first.acl);
            second = await startMcpTestServer({ ...restarted, acl: first.acl });
            const result = await second.mcp.call("update_kanban_card", args);
            expect(result.payload).to.include({ code: "stale_revision", reason: "observation_unavailable" });
            await withRoom(second.server.hocuspocus, `projects/${PROJECT}/tables/tasks`, doc => {
                expect(doc.getMap<Y.Map<unknown>>("data").get("r1")!.get("title")).to.equal("Changed");
            });
            expect(second.kanbanStoreCalls).to.equal(0);
        } finally {
            await second?.stop();
            await first.stop();
        }
    });

    it("retries one unrelated projection drift and succeeds in the same request", async () => {
        const fixture = await startMcpTestServer();
        try {
            await seed(fixture.server.hocuspocus);
            const { read, card } = await observed(fixture);
            let certifications = 0;
            fixture.seams.beforeKanbanFinalCertification = async () => {
                if (++certifications !== 1) return;
                mutateNote(fixture, `peer-${certifications}`);
            };
            const result = await fixture.mcp.call("update_kanban_card", updateArgs(read, card, "retry-once"));
            expect(result.payload).to.include({ applied: true });
            expect(certifications).to.equal(2);
            expect(currentTitle(fixture)).to.equal("Changed");
        } finally {
            await fixture.stop();
        }
    });

    it("exhausts three continuously stale projections without an effect", async () => {
        const fixture = await startMcpTestServer();
        try {
            await seed(fixture.server.hocuspocus);
            const { read, card } = await observed(fixture);
            let certifications = 0;
            fixture.seams.beforeKanbanFinalCertification = async () => mutateNote(fixture, `peer-${++certifications}`);
            const result = await fixture.mcp.call("update_kanban_card", updateArgs(read, card, "retry-three"));
            expect(result.result.isError).to.equal(true);
            expect(result.payload).to.include({ code: "stale_revision", reason: "concurrent_changes" });
            expect(certifications).to.equal(3);
            expect(currentTitle(fixture)).to.equal("First");
        } finally {
            await fixture.stop();
        }
    });

    for (const scenario of ["row", "source", "schema", "destination", "unrelated"] as const) {
        it(`rechecks ${scenario} changes after validation and before the source effect`, async () => {
            const fixture = await startMcpTestServer();
            try {
                await seed(fixture.server.hocuspocus);
                await withRoom(fixture.server.hocuspocus, `projects/${PROJECT}/tables/tasks`, doc => {
                    doc.getMap<Y.Map<unknown>>("data").get("r2")!.set("status", "done");
                });
                const { read, card } = await observed(fixture);
                const projectDoc = fixture.server.hocuspocus.documents.get(`projects/${PROJECT}`) as Y.Doc;
                const boardBefore = projectDoc.getMap("yjsKanbans").toJSON();
                const sourceDoc = fixture.server.hocuspocus.documents.get(`projects/${PROJECT}/tables/tasks`) as Y.Doc;
                const originalRow = sourceDoc.getMap<Y.Map<unknown>>("data").get("r1")!;
                let targetChanges = 0;
                originalRow.observe(event => {
                    if (event.keysChanged.has("title") || event.keysChanged.has("status")) targetChanges++;
                });
                let certified = false, checks = 0, transitioned = false;
                fixture.seams.beforeKanbanFinalCertification = async () => {
                    certified = true;
                };
                fixture.seams.gate = async () => {
                    if (!certified || ++checks !== 2) return;
                    const tableDoc = fixture.server.hocuspocus.documents.get(
                        `projects/${PROJECT}/tables/tasks`,
                    ) as Y.Doc;
                    const data = tableDoc.getMap<Y.Map<unknown>>("data");
                    if (scenario === "row") {
                        const old = data.get("r1")!;
                        const replacement = new Y.Map<unknown>();
                        for (const [key, value] of old.entries()) replacement.set(key, value);
                        data.set("r1", replacement);
                        expect(data.get("r1")).not.to.equal(old);
                    } else if (scenario === "source") {
                        const project = fixture.server.hocuspocus.documents.get(`projects/${PROJECT}`) as Y.Doc;
                        const registry = project.getMap<Y.Map<unknown>>("yjsTables");
                        const old = registry.get("tasks")!;
                        const replacement = new Y.Map<unknown>();
                        for (const [key, value] of old.entries()) replacement.set(key, value);
                        registry.set("tasks", replacement);
                        expect(registry.get("tasks")).not.to.equal(old);
                    } else if (scenario === "schema") {
                        const schema = tableDoc.getText("schema");
                        schema.insert(schema.length - 1, ", CHECK (title <> 'Changed')");
                        expect(schema.toString()).to.include("CHECK (title <> 'Changed')");
                    } else if (scenario === "destination") {
                        data.get("r2")!.set("status", "todo");
                        expect(data.get("r2")!.get("status")).to.equal("todo");
                    } else {
                        data.get("r2")!.set("note", "peer");
                    }
                    transitioned = true;
                };
                const beforeStores = fixture.kanbanStoreCalls;
                const args = scenario === "destination"
                    ? {
                        projectId: PROJECT,
                        kanbanId: "board",
                        sourceRef: card.sourceRef,
                        observationToken: read.observationToken,
                        operationId: `boundary-${scenario}`,
                        destination: "done",
                    }
                    : updateArgs(read, card, `boundary-${scenario}`);
                const result = await fixture.mcp.call(
                    scenario === "destination" ? "move_kanban_card" : "update_kanban_card",
                    args,
                );
                expect(transitioned).to.equal(true);
                if (scenario === "unrelated") {
                    expect(result.payload).to.include({ applied: true });
                    expect(currentTitle(fixture)).to.equal("Changed");
                    expect(fixture.kanbanStoreCalls - beforeStores).to.equal(1);
                    expect(targetChanges).to.equal(1);
                } else {
                    expect(result.result.isError).to.equal(true);
                    expect(currentTitle(fixture)).to.equal("First");
                    expect(fixture.kanbanStoreCalls).to.equal(beforeStores);
                    expect(targetChanges).to.equal(0);
                }
                expect(projectDoc.getMap("yjsKanbans").toJSON()).to.deep.equal(boardBefore);
                const persisted = await createDocumentLoader(fixture.server.persistence!)(
                    `projects/${PROJECT}/tables/tasks`,
                );
                expect(persisted!.getMap<Y.Map<unknown>>("data").get("r1")!.get("title"))
                    .to.equal(scenario === "unrelated" ? "Changed" : "First");
            } finally {
                await fixture.stop();
            }
        });
    }

    it("joins simultaneous calls with the same operation identity into one physical effect", async () => {
        const fixture = await startMcpTestServer();
        try {
            await seed(fixture.server.hocuspocus);
            const { read, card } = await observed(fixture);
            const reached = deferred(), release = deferred();
            let certifications = 0;
            fixture.seams.beforeKanbanFinalCertification = async () => {
                certifications++;
                reached.resolve();
                await release.promise;
            };
            const request = updateArgs(read, card, "joined-operation");
            const doc = fixture.server.hocuspocus.documents.get(`projects/${PROJECT}/tables/tasks`) as Y.Doc;
            let effects = 0;
            doc.getMap<Y.Map<unknown>>("data").get("r1")!.observe(event => {
                if (event.keysChanged.has("title")) effects++;
            });
            const beforeStores = fixture.kanbanStoreCalls;
            const first = fixture.mcp.call("update_kanban_card", request);
            await reached.promise;
            const joined = deferred();
            const original = IdempotencyCache.prototype.runChecked;
            const observer = sinon.stub(IdempotencyCache.prototype, "runChecked").callsFake(function(
                this: IdempotencyCache,
                ...args
            ) {
                const pending = original.apply(this, args);
                joined.resolve();
                return pending;
            });
            const second = fixture.mcp.call("update_kanban_card", request);
            await joined.promise;
            observer.restore();
            release.resolve();
            const results = await Promise.all([first, second]);
            expect(results.map(result => result.payload.replayed).sort()).to.deep.equal([false, true]);
            expect(results.every(result => result.payload.applied === true)).to.equal(true);
            expect(certifications).to.equal(1);
            expect(fixture.kanbanStoreCalls - beforeStores).to.equal(1);
            expect(effects).to.equal(1);
            const saved = await createDocumentLoader(fixture.server.persistence!)(`projects/${PROJECT}/tables/tasks`);
            expect(saved!.getMap<Y.Map<unknown>>("data").get("r1")!.get("title")).to.equal("Changed");
        } finally {
            await fixture.stop();
        }
    });

    it("audits a durable effect truthfully when authorization is revoked before disclosure", async () => {
        const fixture = await startMcpTestServer();
        try {
            await seed(fixture.server.hocuspocus);
            const { read, card } = await observed(fixture);
            fixture.seams.afterStore = room => {
                if (room.endsWith("/tables/tasks")) fixture.acl.revokeAll(PROJECT);
            };
            const result = await fixture.mcp.call("update_kanban_card", updateArgs(read, card, "revoked-effect"));
            expect(result.result.isError).to.equal(true);
            expect(result.payload).to.include({ code: "forbidden" });
            expect(result.payload).not.to.have.property("sourceRef");
            expect(currentTitle(fixture)).to.equal("Changed");
            expect((await auditRecords(["revoked-effect"]))[0]).to.include({
                tool: "update_kanban_card",
                operationId: "revoked-effect",
                outcome: "forbidden",
                applied: true,
                replayed: false,
            });
            fixture.seams.afterStore = undefined;
            fixture.acl.grant("projectUsers", PROJECT, UID);
            const stores = fixture.kanbanStoreCalls;
            const replay = await fixture.mcp.call("update_kanban_card", updateArgs(read, card, "revoked-effect"));
            expect(replay.payload).to.include({ applied: true, replayed: true });
            expect(fixture.kanbanStoreCalls).to.equal(stores);
        } finally {
            await fixture.stop();
        }
    });

    it("retains the effect in audit when disclosure is denied then access returns", async () => {
        const fixture = await startMcpTestServer();
        try {
            await seed(fixture.server.hocuspocus);
            const { read, card } = await observed(fixture);
            let stored = false, disclosureChecks = 0;
            fixture.seams.afterStore = room => {
                if (room.endsWith("/tables/tasks")) stored = true;
            };
            fixture.seams.gate = () => {
                if (!stored) return;
                if (++disclosureChecks === 2) fixture.acl.revokeAll(PROJECT);
                if (disclosureChecks === 3) fixture.acl.grant("projectUsers", PROJECT, UID);
            };
            const args = updateArgs(read, card, "transient-disclosure-denial");
            const result = await fixture.mcp.call("update_kanban_card", args);
            expect(disclosureChecks).to.equal(3);
            expect(result.result.isError).to.equal(true);
            expect(result.payload).to.include({ code: "forbidden" });
            expect(result.payload).not.to.have.property("sourceRef");
            expect(currentTitle(fixture)).to.equal("Changed");
            expect((await auditRecords(["transient-disclosure-denial"]))[0]).to.include({
                outcome: "forbidden",
                applied: true,
                replayed: false,
            });
            const saved = await createDocumentLoader(fixture.server.persistence!)(`projects/${PROJECT}/tables/tasks`);
            expect(saved!.getMap<Y.Map<unknown>>("data").get("r1")!.get("title")).to.equal("Changed");
            fixture.seams.gate = undefined;
            const stores = fixture.kanbanStoreCalls;
            const replay = await fixture.mcp.call("update_kanban_card", args);
            expect(replay.payload).to.include({ applied: true, replayed: true });
            expect(fixture.kanbanStoreCalls).to.equal(stores);
            let replayChecks = 0;
            fixture.seams.gate = () => {
                if (++replayChecks === 3) fixture.acl.revokeAll(PROJECT);
                if (replayChecks === 4) fixture.acl.grant("projectUsers", PROJECT, UID);
            };
            const deniedReplay = await fixture.mcp.call("update_kanban_card", args);
            expect(replayChecks).to.equal(4);
            expect(deniedReplay.payload).to.include({ code: "forbidden" });
            expect(deniedReplay.payload).not.to.have.property("sourceRef");
            const audit = await auditRecords(["transient-disclosure-denial"]);
            expect(audit[audit.length - 1]).to.include({ outcome: "forbidden", applied: true, replayed: true });
            expect(fixture.kanbanStoreCalls).to.equal(stores);
        } finally {
            await fixture.stop();
        }
    });

    it("replays a completed operation after its response is discarded", async () => {
        const fixture = await startMcpTestServer();
        try {
            await seed(fixture.server.hocuspocus);
            const { read, card } = await observed(fixture);
            const args = updateArgs(read, card, "discarded-response");
            const doc = fixture.server.hocuspocus.documents.get(`projects/${PROJECT}/tables/tasks`) as Y.Doc;
            let effects = 0;
            doc.getMap<Y.Map<unknown>>("data").get("r1")!.observe(event => {
                if (event.keysChanged.has("title")) effects++;
            });
            const before = fixture.kanbanStoreCalls;
            await fixture.mcp.call("update_kanban_card", args);
            expect(currentTitle(fixture)).to.equal("Changed");
            expect(fixture.kanbanStoreCalls - before).to.equal(1);
            const replay = await fixture.mcp.call("update_kanban_card", args);
            expect(replay.payload).to.include({ applied: true, replayed: true });
            expect(fixture.kanbanStoreCalls - before).to.equal(1);
            expect(effects).to.equal(1);
            const saved = await createDocumentLoader(fixture.server.persistence!)(`projects/${PROJECT}/tables/tasks`);
            expect(saved!.getMap<Y.Map<unknown>>("data").get("r1")!.get("title")).to.equal("Changed");
        } finally {
            await fixture.stop();
        }
    });

    it("retains applied:null when acknowledgement fails and disclosure is revoked", async () => {
        const fixture = await startMcpTestServer();
        try {
            await seed(fixture.server.hocuspocus);
            const { read, card } = await observed(fixture);
            fixture.seams.afterStore = room => {
                if (!room.endsWith("/tables/tasks")) return;
                fixture.acl.revokeAll(PROJECT);
                throw new Error("controlled post-store acknowledgement failure");
            };
            const result = await fixture.mcp.call("update_kanban_card", updateArgs(read, card, "revoked-unknown"));
            expect(result.result.isError).to.equal(true);
            expect(result.payload).to.include({ code: "forbidden" });
            expect(currentTitle(fixture)).to.equal("Changed");
            expect((await auditRecords(["revoked-unknown"]))[0]).to.include({
                operationId: "revoked-unknown",
                outcome: "forbidden",
                applied: null,
                replayed: false,
            });
            fixture.seams.afterStore = undefined;
            fixture.acl.grant("projectUsers", PROJECT, UID);
            const stores = fixture.kanbanStoreCalls;
            const replay = await fixture.mcp.call("update_kanban_card", updateArgs(read, card, "revoked-unknown"));
            expect(replay.result.isError).to.equal(true);
            expect(replay.payload).to.include({ code: "internal_failure", applied: null, replayed: true });
            expect(fixture.kanbanStoreCalls).to.equal(stores);
        } finally {
            await fixture.stop();
        }
    });
});

async function seed(host: Parameters<typeof withRoom>[0]) {
    await withRoom(host, `projects/${PROJECT}`, doc => {
        const table = new Y.Map<unknown>();
        table.set("name", "Tasks");
        table.set("sqlName", "tasks");
        doc.getMap("yjsTables").set("tasks", table);
        createKanbanEntry(doc, "board", {
            name: "Board",
            query: "SELECT id, status, title FROM tasks ORDER BY id",
            groupField: "status",
            titleField: "title",
            detailFields: [],
        });
    });
    await withRoom(host, `projects/${PROJECT}/tables/tasks`, doc => {
        doc.getText("schema").insert(
            0,
            "CREATE TABLE tasks(id TEXT PRIMARY KEY, status TEXT, title TEXT NOT NULL, note TEXT)",
        );
        for (const [id, title] of [["r1", "First"], ["r2", "Second"]]) {
            const row = new Y.Map<unknown>();
            row.set("status", "todo");
            row.set("title", title);
            row.set("note", "initial");
            doc.getMap("data").set(id, row);
        }
    });
}

async function observed(fixture: Awaited<ReturnType<typeof startMcpTestServer>>) {
    const response = await fixture.mcp.call("query_kanban", { projectId: PROJECT, kanbanId: "board" });
    const card = response.payload.lanes.flatMap((lane: any) => lane.cards)
        .find((candidate: any) => candidate.sourceRef?.rowId === "r1");
    return { read: response.payload, card };
}
const updateArgs = (read: any, card: any, operationId: string) => ({
    projectId: PROJECT,
    kanbanId: "board",
    sourceRef: card.sourceRef,
    observationToken: read.observationToken,
    outputField: "title",
    value: "Changed",
    operationId,
});
function mutateNote(fixture: Awaited<ReturnType<typeof startMcpTestServer>>, value: string) {
    const doc = fixture.server.hocuspocus.documents.get(`projects/${PROJECT}/tables/tasks`) as Y.Doc;
    doc.getMap<Y.Map<unknown>>("data").get("r2")!.set("note", value);
}
function currentTitle(fixture: Awaited<ReturnType<typeof startMcpTestServer>>) {
    const doc = fixture.server.hocuspocus.documents.get(`projects/${PROJECT}/tables/tasks`) as Y.Doc;
    return doc.getMap<Y.Map<unknown>>("data").get("r1")!.get("title");
}
