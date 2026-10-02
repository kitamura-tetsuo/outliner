import { expect } from "chai";
import fs from "node:fs";
import path from "node:path";
import * as Y from "yjs";
import { orderColumns } from "../../shared/src/services/gridDefinition.js";
import { OutlinerGridPresentationService } from "../src/mcp/grid-presentation.js";
import { UpdateGridPresentationTool } from "../src/mcp/update-grid-presentation-tool.js";
import { createDocumentStore } from "../src/persistence.js";
import { mcpLogger, mcpLogPath } from "../src/utils/log-manager.js";
import { type GridMcpFixture, startGridMcpFixture, UID, updateArgs } from "./mcp-grid-presentation-mcp-fixture.js";
import { AclStore, restartFromStorage, stopTestServer, withRoom } from "./server-create-table-fixture.js";
import {
    Peer,
    PROJECT,
    readGridAsClient,
    readStoredGridAsClient,
    tableState,
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
            const reread = await readStoredGridAsClient(restarted.dir, "grid-tasks");
            expect(reread.labels["title"]).to.equal("件名");
            // A fresh process has no retained outcome: the same identity is
            // a fresh stale attempt (the revision moved), never a replay.
            const store = createDocumentStore(restarted.server.persistence!);
            const access = (uid: string, projectId: string) => acl.checkAccess(uid, projectId);
            const fresh = new UpdateGridPresentationTool(
                new OutlinerGridPresentationService(restarted.server.hocuspocus, access, store),
                access,
            );
            await fresh.update(UID, {
                projectId: PROJECT,
                gridId: "grid-tasks",
                expectedPresentationRevision: grid.presentationRevision,
                changes: { components: { title: { label: "件名" } } },
                operationId,
            }).then(
                () => expect.fail("expected a stale conflict, not a replayed success"),
                error => expect(error.code).to.equal("stale_revision"),
            );
        } finally {
            await stopTestServer(restarted.server);
            await fs.promises.rm(restarted.dir, { recursive: true, force: true });
        }
    });
});
