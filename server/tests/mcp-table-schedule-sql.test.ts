import { expect } from "chai";
import express from "express";
import fs from "fs";
import request from "supertest";
import * as Y from "yjs";
import { createMcpRouter } from "../src/mcp/mcp-api.js";
import { OutlinerReadService } from "../src/mcp/outliner-read-service.js";
import { OutlinerRelationService } from "../src/mcp/relation-service.js";
import { OutlinerScheduleService } from "../src/mcp/schedule-service.js";
import { Project } from "../src/schema/app-schema.js";
import { mcpLogger, mcpLogPath } from "../src/utils/log-manager.js";

const rpc = (name: string, args: Record<string, unknown>) => ({
    jsonrpc: "2.0",
    id: 1,
    method: "tools/call",
    params: { name, arguments: args },
});

const payload = (response: request.Response) => {
    const envelope = response.body?.jsonrpc
        ? response.body
        : JSON.parse(response.text.split("\n").find(line => line.startsWith("data: "))?.slice(6) ?? "{}");
    return JSON.parse(envelope.result.content[0].text);
};

// Covers GitHub issue #5253 ("Add MCP tools to read and update Table
// scheduled SQL"): get_table must surface a write-target schedule's SQL
// directly, and update_table_schedule_sql must correct only that SQL by
// tableId without touching unrelated Table/schedule configuration.
describe("MCP Table scheduled SQL (issue #5253)", () => {
    const BROKEN_SQL = "INSERT INTO tasks (id, title) VALUES ('seed', 'wrong-column') RETURNING *";
    const FIXED_SQL = "INSERT INTO tasks (id, \"order\") VALUES ('seed', 5) RETURNING *";
    const SCHEMA_SQL = 'CREATE TABLE tasks (id TEXT PRIMARY KEY, title TEXT, "order" INTEGER)';

    function buildApp() {
        const project = Project.createInstance("Canonical");
        const tableDescriptor = new Y.Map<unknown>();
        tableDescriptor.set("name", "Tasks");
        tableDescriptor.set("sqlName", "tasks");
        project.ydoc.getMap("yjsTables").set("table-1", tableDescriptor);
        const unscheduledDescriptor = new Y.Map<unknown>();
        unscheduledDescriptor.set("name", "Other");
        unscheduledDescriptor.set("sqlName", "other");
        project.ydoc.getMap("yjsTables").set("table-2", unscheduledDescriptor);

        const rule = new Y.Map<unknown>();
        for (
            const [key, value] of Object.entries({
                name: "Daily import",
                targetTableId: "table-1",
                sql: BROKEN_SQL,
                rrule: "FREQ=DAILY",
                dtstart: "2099-01-01T09:00:00",
                timezone: "UTC",
                enabled: true,
                catchUp: false,
            })
        ) rule.set(key, value);
        project.schedules.set("rule-1", rule as never);

        const tableDoc = new Y.Doc();
        tableDoc.getText("schema").insert(0, SCHEMA_SQL);
        const otherTableDoc = new Y.Doc();
        otherTableDoc.getText("schema").insert(0, "CREATE TABLE other (id TEXT PRIMARY KEY, name TEXT)");
        const rooms = new Map([
            ["projects/project-1", project.ydoc],
            ["projects/project-1/tables/table-1", tableDoc],
            ["projects/project-1/tables/table-2", otherTableDoc],
        ]);
        const hocuspocus = {
            openDirectConnection: async (room: string) => ({ document: rooms.get(room), disconnect: async () => {} }),
        } as never;
        const canAccess = async (_uid: string, projectId: string) => projectId === "project-1";
        const read = new OutlinerReadService(
            hocuspocus,
            canAccess,
            async () => [{ projectId: "project-1", title: "Canonical" }],
        );
        const relations = new OutlinerRelationService(hocuspocus, canAccess);
        const schedules = new OutlinerScheduleService(hocuspocus, canAccess, relations);
        const scope = { write: false };
        const app = express();
        app.use(express.json());
        app.use(createMcpRouter(
            read,
            () => ({ uid: "user", scope: scope.write ? "outliner.read outliner.write" : "outliner.read" }),
            "http://localhost:7093",
            relations,
            schedules,
        ));
        const call = (name: string, args: Record<string, unknown>) =>
            request(app).post("/mcp").set("Authorization", "Bearer token")
                .set("Accept", "application/json, text/event-stream").send(rpc(name, args));
        return { call, scope, rule, tableDoc, project };
    }

    it("reads scheduled SQL from get_table without materializing rows or executing it (AC-001)", async () => {
        const { call } = buildApp();
        const table = payload(await call("get_table", { projectId: "project-1", tableId: "table-1" }));
        expect(table.records).to.equal(undefined);
        const reference = table.scheduleReferences.find((entry: { ruleId: string; }) => entry.ruleId === "rule-1");
        expect(reference.referenceKinds).to.deep.equal(["write-target"]);
        expect(reference).to.include({
            sql: BROKEN_SQL,
            rrule: "FREQ=DAILY",
            dtstart: "2099-01-01T09:00:00",
            timezone: "UTC",
            enabled: true,
        });
        expect(reference.revision).to.be.a("string").with.lengthOf(16);
    });

    it("corrects only the scheduled SQL, leaving Table and schedule configuration untouched (AC-002, AC-003)", async () => {
        if (fs.existsSync(mcpLogPath)) fs.truncateSync(mcpLogPath, 0);
        const { call, scope, rule, tableDoc } = buildApp();
        const before = payload(await call("get_table", { projectId: "project-1", tableId: "table-1" }));
        const reference = before.scheduleReferences.find((entry: { ruleId: string; }) => entry.ruleId === "rule-1");

        const denied = payload(
            await call("update_table_schedule_sql", {
                projectId: "project-1",
                tableId: "table-1",
                sql: FIXED_SQL,
                expectedRevision: reference.revision,
            }),
        );
        expect(denied.code).to.equal("forbidden");
        expect(rule.get("sql")).to.equal(BROKEN_SQL);

        scope.write = true;
        const updated = payload(
            await call("update_table_schedule_sql", {
                projectId: "project-1",
                tableId: "table-1",
                sql: FIXED_SQL,
                expectedRevision: reference.revision,
                operationId: "fix-title-column-1",
            }),
        );
        expect(updated).to.include({
            projectId: "project-1",
            tableId: "table-1",
            ruleId: "rule-1",
            applied: true,
            replayed: false,
            sql: FIXED_SQL,
        });
        expect(updated.revision).to.be.a("string").and.not.equal(reference.revision);

        // Persisted to the same state the UI/scheduler read (REQ-004), and
        // never executed as a side effect of the update (REQ-005).
        expect(rule.get("sql")).to.equal(FIXED_SQL);
        expect(tableDoc.getMap("data").size).to.equal(0);

        // Unrelated Table and schedule configuration is untouched (AC-003).
        const after = payload(await call("get_table", { projectId: "project-1", tableId: "table-1" }));
        expect(after.displayName).to.equal("Tasks");
        expect(after.rawSchemaSql).to.equal(SCHEMA_SQL);
        const afterReference = after.scheduleReferences.find((entry: { ruleId: string; }) => entry.ruleId === "rule-1");
        expect(afterReference).to.include({
            sql: FIXED_SQL,
            rrule: "FREQ=DAILY",
            dtstart: "2099-01-01T09:00:00",
            timezone: "UTC",
            enabled: true,
        });
        const schedule = payload(await call("get_schedule", { projectId: "project-1", ruleId: "rule-1" }));
        expect(schedule.stored).to.include({ name: "Daily import", targetTableId: "table-1", catchUp: false });

        mcpLogger.flush?.();
        await new Promise(resolve => setTimeout(resolve, 100));
        const audits = fs.readFileSync(mcpLogPath, "utf8").split("\n").filter(Boolean)
            .map(line => JSON.parse(line)).filter(line =>
                line.event === "mcp_audit" && line.tool === "update_table_schedule_sql"
            );
        expect(audits.map(line => ({ entity: line.entity, outcome: line.outcome, applied: line.applied }))).to
            .deep.equal([
                { entity: "table:table-1", outcome: "forbidden", applied: false },
                { entity: "table:table-1", outcome: "success", applied: true },
            ]);
        expect(JSON.stringify(audits)).not.to.include(FIXED_SQL);
    });

    it("reports a conflict rather than overwriting a concurrent SQL change (AC-006)", async () => {
        const { call, scope, rule } = buildApp();
        const staleReference = payload(await call("get_table", { projectId: "project-1", tableId: "table-1" }))
            .scheduleReferences.find((entry: { ruleId: string; }) => entry.ruleId === "rule-1");
        scope.write = true;
        // Client B's concurrent, already-applied change.
        const concurrent = payload(
            await call("update_table_schedule_sql", {
                projectId: "project-1",
                tableId: "table-1",
                sql: FIXED_SQL,
                expectedRevision: staleReference.revision,
            }),
        );
        expect(concurrent.applied).to.equal(true);

        // Client A retries its write based on the now-stale revision it read first.
        const conflict = payload(
            await call("update_table_schedule_sql", {
                projectId: "project-1",
                tableId: "table-1",
                sql: "INSERT INTO tasks (id, title) VALUES ('seed', 'client-a') RETURNING *",
                expectedRevision: staleReference.revision,
            }),
        );
        expect(conflict.code).to.equal("stale_revision");
        expect(rule.get("sql")).to.equal(FIXED_SQL);
    });

    it("fails explicitly for an invalid target rather than reporting false success (AC-005)", async () => {
        const { call, scope } = buildApp();
        scope.write = true;
        const missingTable = payload(
            await call("update_table_schedule_sql", {
                projectId: "project-1",
                tableId: "no-such-table",
                sql: FIXED_SQL,
                expectedRevision: "anything",
            }),
        );
        expect(missingTable.code).to.equal("not_found");

        const outsideProject = payload(
            await call("update_table_schedule_sql", {
                projectId: "secret-project",
                tableId: "table-1",
                sql: FIXED_SQL,
                expectedRevision: "anything",
            }),
        );
        expect(outsideProject.code).to.equal("forbidden");

        const unscheduledTable = payload(
            await call("update_table_schedule_sql", {
                projectId: "project-1",
                tableId: "table-2",
                sql: FIXED_SQL,
                expectedRevision: "anything",
            }),
        );
        expect(unscheduledTable.code).to.equal("not_found");
    });

    it("still returns the corrected SQL after the MCP connection is recreated (AC-007)", async () => {
        const { call, scope } = buildApp();
        const reference = payload(await call("get_table", { projectId: "project-1", tableId: "table-1" }))
            .scheduleReferences.find((entry: { ruleId: string; }) => entry.ruleId === "rule-1");
        scope.write = true;
        await call("update_table_schedule_sql", {
            projectId: "project-1",
            tableId: "table-1",
            sql: FIXED_SQL,
            expectedRevision: reference.revision,
        });
        // Each MCP request in this contract opens a brand-new server-side
        // MCP session (see createMcpRouter), so issuing another call is
        // exactly "the MCP connection is recreated" from the client's view.
        const reread = payload(await call("get_table", { projectId: "project-1", tableId: "table-1" }));
        expect(reread.scheduleReferences.find((entry: { ruleId: string; }) => entry.ruleId === "rule-1").sql).to
            .equal(FIXED_SQL);
    });

    it("keeps the write-target schedule visible past 25 lexicographically earlier sql-reference schedules", async () => {
        const { call, rule, project } = buildApp();
        // Every "aaa-*" id sorts before "rule-1"; each merely mentions "tasks"
        // in its own SQL so it counts as a sql-reference for table-1.
        for (let index = 0; index < 30; index++) {
            const filler = new Y.Map<unknown>();
            filler.set("targetTableId", "table-2");
            filler.set("sql", "SELECT tasks.id FROM tasks");
            filler.set("rrule", "FREQ=DAILY");
            filler.set("dtstart", "2099-01-01T09:00:00");
            filler.set("timezone", "UTC");
            project.schedules.set(`aaa-${String(index).padStart(2, "0")}`, filler as never);
        }
        const table = payload(await call("get_table", { projectId: "project-1", tableId: "table-1" }));
        expect(table.scheduleReferences).to.have.lengthOf(25);
        const reference = table.scheduleReferences.find((entry: { ruleId: string; }) => entry.ruleId === "rule-1");
        expect(reference).to.include({ sql: BROKEN_SQL });
        expect(rule.get("sql")).to.equal(BROKEN_SQL);
    });

    it("reports the unchanged stored SQL, not the proposed one, for a dry run", async () => {
        const { call, scope, rule } = buildApp();
        const reference = payload(await call("get_table", { projectId: "project-1", tableId: "table-1" }))
            .scheduleReferences.find((entry: { ruleId: string; }) => entry.ruleId === "rule-1");
        scope.write = true;
        const dryRun = payload(
            await call("update_table_schedule_sql", {
                projectId: "project-1",
                tableId: "table-1",
                sql: FIXED_SQL,
                expectedRevision: reference.revision,
                dryRun: true,
            }),
        );
        expect(dryRun).to.include({ applied: false, sql: BROKEN_SQL });
        expect(rule.get("sql")).to.equal(BROKEN_SQL);
    });

    it("does not collide with update_schedule_rule's idempotency cache for the same ruleId/operationId", async () => {
        const { call, scope } = buildApp();
        const reference = payload(await call("get_table", { projectId: "project-1", tableId: "table-1" }))
            .scheduleReferences.find((entry: { ruleId: string; }) => entry.ruleId === "rule-1");
        scope.write = true;
        const renamed = payload(
            await call("update_schedule_rule", {
                projectId: "project-1",
                ruleId: "rule-1",
                changes: { name: "Renamed import" },
                expectedRevision: reference.revision,
                operationId: "shared-operation-id",
            }),
        );
        expect(renamed).to.include({ applied: true });
        // Reusing the same operationId for the Table-centric shortcut on the
        // same ruleId must run as its own mutation, not replay the rename's
        // cached result (whose diff has no `sql` field at all).
        const fixed = payload(
            await call("update_table_schedule_sql", {
                projectId: "project-1",
                tableId: "table-1",
                sql: FIXED_SQL,
                expectedRevision: renamed.revision,
                operationId: "shared-operation-id",
            }),
        );
        expect(fixed).to.include({ applied: true, replayed: false, sql: FIXED_SQL });
    });
});
