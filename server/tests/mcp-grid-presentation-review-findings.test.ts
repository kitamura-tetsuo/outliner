import { expect } from "chai";
import fs from "node:fs";
import path from "node:path";
import * as Y from "yjs";
import { orderColumns } from "../../shared/src/services/gridDefinition.js";
import { mcpLogger, mcpLogPath } from "../src/utils/log-manager.js";
import {
    type GridMcpFixture,
    rpcClient,
    startGridMcpFixture,
    UID,
    updateArgs,
} from "./mcp-grid-presentation-mcp-fixture.js";
import { AclStore, restartFromStorage, stopTestServer, withRoom } from "./server-create-table-fixture.js";
import {
    Peer,
    PROJECT,
    readGridAsClient,
    readStoredGridAsClient,
    TABLE_ID,
    tableState,
    untouchedState,
} from "./server-grid-presentation-fixture.js";

// Issue #5436 review findings: operator-guide coverage (REQ-009), audit
// presentation revisions (REQ-009), normal-reader consumption (REQ-010),
// and persistence/restart replay limits (REQ-011).
describe("MCP grid presentation review findings (#5436)", function() {
    this.timeout(90000);
    let t: GridMcpFixture;

    beforeEach(async () => {
        t = await startGridMcpFixture();
    });
    afterEach(async () => {
        await t.stop();
    });

    const liveState = () => withRoom(t.server.hocuspocus, `projects/${PROJECT}`, doc => Y.encodeStateAsUpdate(doc));

    it("documents presentation semantics and the Japanese workflow in the operator guide", async () => {
        // Server tests run with cwd set to server/, so resolve from either root.
        const candidates = [
            path.join(process.cwd(), "docs/chatgpt-mcp-integration.md"),
            path.join(process.cwd(), "../docs/chatgpt-mcp-integration.md"),
        ];
        const found = candidates.find(candidate => fs.existsSync(candidate));
        expect(found, "operator guide must exist").to.be.a("string");
        const guide = fs.readFileSync(found!, "utf8");
        for (
            const required of [
                "update_grid_presentation",
                "presentationRevision",
                "grid-presentation-v1",
                "five minutes",
                "operation_id_reused",
                "dryRun",
                "期限",
                "完了",
            ]
        ) {
            expect(guide, `guide must contain ${required}`).to.contain(required);
        }
        const section = guide.slice(guide.indexOf("Grid presentation editing"));
        expect(section).to.contain("saved");
        expect(section).to.contain("exact");
        expect(section).to.contain("never SQL");
    });

    it("audits presentation success with prior/resulting revisions and no private payload", async () => {
        const operationId = `audit-pres-${Date.now()}`;
        const grid = (await t.production.call("get_grid", { projectId: PROJECT, gridId: "grid-tasks" })).payload;
        const applied = await t.production.call(
            "update_grid_presentation",
            updateArgs({
                expectedPresentationRevision: grid.presentationRevision,
                changes: { components: { title: { label: "件名" } } },
                operationId,
            }),
        );
        expect(applied.payload).to.include({ applied: true, replayed: false });
        await new Promise<void>((resolve, reject) => mcpLogger.flush(error => error ? reject(error) : resolve()));
        const records = fs.readFileSync(mcpLogPath, "utf8").split("\n").filter(Boolean).map(line => {
            try {
                return JSON.parse(line);
            } catch {
                return undefined;
            }
        }).filter(record => record?.event === "mcp_audit" && record?.operationId === operationId);
        expect(records).to.have.length(1);
        const record = records[0];
        expect(record).to.include({
            tool: "update_grid_presentation",
            projectId: PROJECT,
            entity: "grid:grid-tasks",
            outcome: "success",
            applied: true,
            replayed: false,
            dryRun: false,
            priorRevision: applied.payload.priorPresentationRevision,
            newRevision: applied.payload.presentationRevision,
        });
        expect(record.uidFingerprint).to.be.a("string");
        expect(JSON.stringify(record)).to.not.contain("件名");
        expect(JSON.stringify(record)).to.not.contain(UID);
    });

    it("saved MCP settings are consumed by normal readers on both peers with stable identities", async () => {
        const peerA = await Peer.connect(t.server.hocuspocus);
        const peerB = await Peer.connect(t.server.hocuspocus);
        try {
            const tableBefore = await tableState(t.server.hocuspocus);
            const separateBefore = readGridAsClient(await liveState(), "grid-separate");
            const grid = (await t.production.call("get_grid", { projectId: PROJECT, gridId: "grid-tasks" })).payload;
            const { payload } = await t.production.call(
                "update_grid_presentation",
                updateArgs({
                    expectedPresentationRevision: grid.presentationRevision,
                    changes: {
                        components: {
                            due_date: { label: "期限" },
                            done: { label: "完了", type: "checkbox" },
                            id: { shown: false },
                        },
                        columnOrder: ["done", "due_date"],
                    },
                    operationId: `renderer-${Date.now()}`,
                }),
            );
            expect(payload).to.include({ applied: true, replayed: false });
            // Both ordinary peers converge on the identical saved definition
            // after synchronization (the websocket sync real browsers perform,
            // applied here as the live room state to each peer document).
            const synced = await liveState();
            Y.applyUpdate(peerA.doc, synced);
            Y.applyUpdate(peerB.doc, synced);
            const seenA = readGridAsClient(Y.encodeStateAsUpdate(peerA.doc), "grid-tasks")!;
            const seenB = readGridAsClient(Y.encodeStateAsUpdate(peerB.doc), "grid-tasks")!;
            expect(seenA).to.deep.equal(seenB);
            // Headers show the nonempty label override; column identity stays
            // bound to the unchanged exact result names.
            const headerOf = (name: string) => (seenA.labels[name]?.length ?? 0) > 0 ? seenA.labels[name] : name;
            expect(headerOf("due_date")).to.equal("期限");
            expect(headerOf("done")).to.equal("完了");
            expect(Object.keys(seenA.labels)).to.include("due_date");
            expect(Object.keys(seenA.labels)).to.not.include("期限");
            // Visible order is present saved-order names then remaining result
            // names in result order, filtered by shown.
            const resultColumns = ["id", "title", "due_date", "done"];
            const visible = orderColumns(resultColumns, seenA.columnOrder)
                .filter(name => seenA.hidden[name] !== true);
            expect(visible[0]).to.equal("done");
            expect(visible).to.include("due_date");
            expect(visible).to.not.include("id");
            // The explicit checkbox override is stored exactly.
            expect(seenA.types["done"]).to.equal("checkbox");
            // Query, schema, records and the separate Grid are untouched.
            expect(seenA.query).to.equal("SELECT id, title, due_date, done FROM tasks");
            expect(await tableState(t.server.hocuspocus)).to.deep.equal(tableBefore);
            expect(readGridAsClient(await liveState(), "grid-separate")).to.deep.equal(separateBefore);
        } finally {
            await peerA.disconnect();
            await peerB.disconnect();
        }
    });

    it("keeps stable record write targets after relabel, reload and a boolean cell write", async () => {
        // Normal browser Table authoring: two records with distinct stable
        // IDs and opposite done values.
        await withRoom(t.server.hocuspocus, `projects/${PROJECT}/tables/${TABLE_ID}`, doc => {
            const data = doc.getMap("data");
            if (!data.has("r2")) {
                const record = new Y.Map<unknown>();
                record.set("id", "r2");
                record.set("title", "Pay bills");
                record.set("due_date", "2026-11-30");
                record.set("done", true);
                data.set("r2", record);
            }
        });
        const tableBefore = await tableState(t.server.hocuspocus);
        expect(tableBefore.data["r1"]).to.exist;
        expect(tableBefore.data["r2"]).to.exist;
        const separateBefore = readGridAsClient(await liveState(), "grid-separate");
        const untouchedBefore = await withRoom(
            t.server.hocuspocus,
            `projects/${PROJECT}`,
            doc => untouchedState(doc, "grid-tasks"),
        );
        // Both placements of the same Grid exist before the MCP edit.
        expect(untouchedBefore.placements.filter(placement => placement.gridId === "grid-tasks")).to.have.length(2);
        const queryBefore =
            (await t.production.call("get_grid", { projectId: PROJECT, gridId: "grid-tasks" })).payload.query;

        const grid = (await t.production.call("get_grid", { projectId: PROJECT, gridId: "grid-tasks" })).payload;
        const { payload } = await t.production.call(
            "update_grid_presentation",
            updateArgs({
                expectedPresentationRevision: grid.presentationRevision,
                changes: {
                    components: {
                        due_date: { label: "期限" },
                        done: { label: "完了", type: "checkbox" },
                        id: { shown: false },
                    },
                    columnOrder: ["done", "due_date"],
                },
                operationId: `write-target-${Date.now()}`,
            }),
        );
        expect(payload).to.include({ applied: true, replayed: false });

        // Both ordinary peers observe the same relabeled definition, and both
        // placements of the Grid share it while the separate Grid is unchanged.
        const synced = await liveState();
        const peerA = await Peer.connect(t.server.hocuspocus);
        const peerB = await Peer.connect(t.server.hocuspocus);
        try {
            Y.applyUpdate(peerA.doc, synced);
            Y.applyUpdate(peerB.doc, synced);
            const seenA = readGridAsClient(Y.encodeStateAsUpdate(peerA.doc), "grid-tasks")!;
            const seenB = readGridAsClient(Y.encodeStateAsUpdate(peerB.doc), "grid-tasks")!;
            expect(seenA).to.deep.equal(seenB);
            const headerOf = (name: string) => (seenA.labels[name]?.length ?? 0) > 0 ? seenA.labels[name] : name;
            expect(headerOf("due_date")).to.equal("期限");
            expect(headerOf("done")).to.equal("完了");
            // DOM column identity stays bound to the unchanged result names.
            expect(Object.keys(seenA.labels)).to.include("due_date");
            expect(Object.keys(seenA.labels)).to.not.include("期限");
            const resultColumns = ["id", "title", "due_date", "done"];
            const visible = orderColumns(resultColumns, seenA.columnOrder)
                .filter(name => seenA.hidden[name] !== true);
            expect(visible[0]).to.equal("done");
            expect(visible).to.include("due_date");
            expect(visible).to.not.include("id");
            const placementsAfter = await withRoom(
                t.server.hocuspocus,
                `projects/${PROJECT}`,
                doc => untouchedState(doc, "grid-tasks"),
            );
            expect(placementsAfter.placements.filter(placement => placement.gridId === "grid-tasks")).to.have.length(
                2,
            );
        } finally {
            await peerA.disconnect();
            await peerB.disconnect();
        }

        // Reload from acknowledged production storage without reseeding: the
        // saved presentation persists.
        const reloaded = await readStoredGridAsClient(t.dir, "grid-tasks");
        expect(reloaded.labels["due_date"]).to.equal("期限");
        expect(reloaded.labels["done"]).to.equal("完了");

        // Toggle 完了 for one identified record through the real record write
        // path, addressed by stable record ID rather than displayed row index.
        const table = (await t.production.call(
            "get_table",
            { projectId: PROJECT, tableId: TABLE_ID, includeRecords: true, recordLimit: 25 },
        )).payload;
        const before = table.records.find((record: { recordId: string; }) => record.recordId === "r1");
        expect(before.values.done).to.equal(false);
        const written = await t.production.call("update_table_records", {
            projectId: PROJECT,
            tableId: TABLE_ID,
            expectedRevision: table.revision,
            changes: [{ recordId: "r1", values: { done: true } }],
        });
        expect(written.payload.records).to.have.length(1);

        // Independently read the Table: only that original record's physical
        // done field changed — not a Japanese-named field, another row, or
        // another Table — with query/schema/identities and the separate Grid
        // unchanged.
        const after = (await t.production.call(
            "get_table",
            { projectId: PROJECT, tableId: TABLE_ID, includeRecords: true, recordLimit: 25 },
        )).payload;
        const r1 = after.records.find((record: { recordId: string; }) => record.recordId === "r1");
        const r2 = after.records.find((record: { recordId: string; }) => record.recordId === "r2");
        expect(r1.values.done).to.equal(true);
        expect(r1.values.title).to.equal(tableBefore.data["r1"].title);
        expect(r1.values).to.not.have.property("完了");
        // The other record is untouched: its opposite done value and every
        // other physical field survive the relabeled write.
        expect(r2.values.done).to.equal(true);
        expect(r2.values.title).to.equal(tableBefore.data["r2"].title);
        expect(r2.values.due_date).to.equal(tableBefore.data["r2"].due_date);
        expect(after.schema).to.deep.equal(table.schema);
        const reread = (await t.production.call("get_grid", { projectId: PROJECT, gridId: "grid-tasks" })).payload;
        expect(reread.query).to.equal(queryBefore);
        expect(reread.presentationRevision).to.equal(payload.presentationRevision);
        expect(readGridAsClient(await liveState(), "grid-separate")).to.deep.equal(separateBefore);
    });

    it("persists presentation across restart without restart-durable replay", async () => {
        const operationId = `restart-${Date.now()}`;
        const grid = (await t.production.call("get_grid", { projectId: PROJECT, gridId: "grid-tasks" })).payload;
        const applied = await t.production.call(
            "update_grid_presentation",
            updateArgs({
                expectedPresentationRevision: grid.presentationRevision,
                changes: { components: { title: { label: "件名" } } },
                operationId,
            }),
        );
        expect(applied.payload).to.include({ applied: true });
        // Storage alone (no reseeding) holds the saved configuration.
        expect((await readStoredGridAsClient(t.dir, "grid-tasks")).labels["title"]).to.equal("件名");
        // Restart from acknowledged production storage without reseeding.
        const acl = new AclStore();
        const restarted = await restartFromStorage(t.dir, acl);
        try {
            acl.grant("projectUsers", PROJECT, UID);
            // The restarted production MCP endpoint serves the saved
            // configuration, and two fresh normal readers observe the same
            // definition from storage alone.
            const fresh = rpcClient(restarted.server.server);
            const reread = (await fresh.call("get_grid", { projectId: PROJECT, gridId: "grid-tasks" })).payload;
            expect(reread.presentation.components.title.label).to.equal("件名");
            expect(reread.presentationRevision).to.equal(applied.payload.presentationRevision);
            const readerA = await readStoredGridAsClient(restarted.dir, "grid-tasks");
            const readerB = await readStoredGridAsClient(restarted.dir, "grid-tasks");
            expect(readerA.labels["title"]).to.equal("件名");
            expect(readerB).to.deep.equal(readerA);
            // A fresh process has no retained outcome: retrying the same
            // operation identity through MCP is a fresh stale attempt (the
            // revision moved), never a restart-durable replayed success.
            const retry = await fresh.call(
                "update_grid_presentation",
                updateArgs({
                    expectedPresentationRevision: grid.presentationRevision,
                    changes: { components: { title: { label: "件名" } } },
                    operationId,
                }),
            );
            expect(retry.result.isError).to.equal(true);
            expect(retry.payload.code).to.equal("stale_revision");
            expect(retry.payload.currentPresentationRevision).to.equal(applied.payload.presentationRevision);
            expect(retry.payload).to.not.have.property("replayed");
        } finally {
            await stopTestServer(restarted.server);
            await fs.promises.rm(restarted.dir, { recursive: true, force: true });
        }
    });
});
