import { Hocuspocus } from "@hocuspocus/server";
import { expect } from "chai";
import express from "express";
import fs from "fs";
import request from "supertest";
import * as Y from "yjs";
import { createMcpRouter } from "../src/mcp/mcp-api.js";
import { OutlinerReadService } from "../src/mcp/outliner-read-service.js";
import { OutlinerRelationService } from "../src/mcp/relation-service.js";
import { OutlinerScheduleService } from "../src/mcp/schedule-service.js";
import { JobExecutor } from "../src/scheduler/executor.js";
import { Project } from "../src/schema/app-schema.js";
import { mcpLogger, mcpLogPath } from "../src/utils/log-manager.js";

const rpc = (method: string, params?: Record<string, unknown>) => ({
    jsonrpc: "2.0",
    id: 1,
    method,
    ...(params ? { params } : {}),
});
const toolCall = (name: string, args: Record<string, unknown>) => rpc("tools/call", { name, arguments: args });
const envelope = (response: request.Response) =>
    response.body?.jsonrpc
        ? response.body
        : JSON.parse(response.text.split("\n").find(line => line.startsWith("data: "))?.slice(6) ?? "{}");
const payload = (response: request.Response) => {
    const rpcEnvelope = envelope(response);
    return { envelope: rpcEnvelope, value: JSON.parse(rpcEnvelope.result.content[0].text) };
};

describe("Schedule MCP HTTP contract", () => {
    it("resolves, discovers, previews, scopes, and revision-guards Schedule tools", async function() {
        this.timeout(30_000);
        if (fs.existsSync(mcpLogPath)) fs.truncateSync(mcpLogPath, 0);
        const hocuspocus = new Hocuspocus({ quiet: true });
        const projectConnection = await hocuspocus.openDirectConnection("projects/project-1", {
            context: { uid: "user" },
        });
        const project = Project.fromDoc(projectConnection.document);
        const table = new Y.Map<unknown>();
        table.set("name", "Tasks");
        table.set("sqlName", "tasks");
        project.ydoc.getMap("yjsTables").set("table-1", table);
        const auditTable = new Y.Map<unknown>();
        auditTable.set("name", "Audit");
        auditTable.set("sqlName", "audit");
        project.ydoc.getMap("yjsTables").set("audit-table", auditTable);
        const rule = new Y.Map<unknown>();
        for (
            const [key, value] of Object.entries({
                name: "Daily",
                targetTableId: "table-1",
                sql: "INSERT INTO tasks (id, order) VALUES ('daily', 1) RETURNING *",
                rrule: "FREQ=DAILY",
                dtstart: "2099-01-01T09:00:00",
                timezone: "UTC",
                enabled: true,
                catchUp: false,
                lastRunStatus: "error",
                lastRunError: 'syntax error near reserved identifier "order"',
            })
        ) rule.set(key, value);
        project.schedules.set("rule-1", rule as never);
        const tableConnection = await hocuspocus.openDirectConnection("projects/project-1/tables/table-1", {
            context: { uid: "user" },
        });
        const schemaSql = 'CREATE TABLE tasks (id TEXT PRIMARY KEY, "order" INTEGER NOT NULL CHECK ("order" > 0))';
        tableConnection.document.getText("schema").insert(0, schemaSql);
        const auditConnection = await hocuspocus.openDirectConnection("projects/project-1/tables/audit-table", {
            context: { uid: "user" },
        });
        auditConnection.document.getText("schema").insert(
            0,
            "CREATE TABLE audit (id TEXT PRIMARY KEY, title TEXT NOT NULL, score INTEGER CHECK (score > 0))",
        );
        const canAccess = async (uid: string, projectId: string) => uid === "user" && projectId === "project-1";
        const read = new OutlinerReadService(
            hocuspocus,
            canAccess,
            async () => [{ projectId: "project-1", title: "Canonical" }],
        );
        const relations = new OutlinerRelationService(hocuspocus, canAccess);
        const schedules = new OutlinerScheduleService(hocuspocus, canAccess, relations);
        let write = false;
        const app = express();
        app.use(express.json());
        app.use(
            createMcpRouter(
                read,
                () => ({ uid: "user", scope: write ? "outliner.read outliner.write" : "outliner.read" }),
                "http://localhost:7093",
                relations,
                schedules,
            ),
        );
        const call = (body: object) =>
            request(app).post("/mcp").set("Authorization", "Bearer token").set(
                "Accept",
                "application/json, text/event-stream",
            ).send(body);

        const catalog = envelope(await call(rpc("tools/list"))).result.tools;
        expect(catalog.find((entry: { name: string; }) => entry.name === "validate_schedule_rule").annotations)
            .to.include({ readOnlyHint: true });
        expect(catalog.find((entry: { name: string; }) => entry.name === "update_schedule_rule").annotations)
            .to.include({ readOnlyHint: false, destructiveHint: false, idempotentHint: true });
        expect(
            payload(await call(toolCall("resolve_url", { url: "https://example.test/Canonical/-/schedules" }))).value,
        ).to.deep.equal({ projectId: "project-1", kind: "schedule-list" });
        expect(
            payload(await call(toolCall("resolve_url", { url: "https://example.test/Canonical/-/tables/table-1" })))
                .value,
        ).to.include({ projectId: "project-1", entityId: "table-1", kind: "table" });
        expect(
            payload(await call(toolCall("resolve_url", { url: "https://example.test/Canonical/-/schedules/rule-1" })))
                .value,
        ).to.include({ entityId: "rule-1", kind: "schedule" });
        const malformed = payload(
            await call(toolCall("resolve_url", {
                url: "https://example.test/Canonical/-/schedules/rule-1/extra",
            })),
        ).value;
        expect(malformed.code).to.equal("invalid_argument");
        const inaccessible = payload(await call(toolCall("list_schedules", { projectId: "secret-project" }))).value;
        expect(inaccessible).to.deep.include({ code: "forbidden", error: "Project is inaccessible" });
        const listed =
            payload(await call(toolCall("list_schedules", { projectId: "project-1", tableId: "table-1", limit: 1 })))
                .value;
        expect(listed.schedules[0]).to.include({ ruleId: "rule-1" });
        const readRule =
            payload(await call(toolCall("get_schedule", { projectId: "project-1", ruleId: "rule-1" }))).value;
        expect(readRule.stored).to.include({ lastRunStatus: "error" });
        const candidate = {
            ...readRule.stored,
            sql: "INSERT INTO tasks (id, \"order\") VALUES ('fixed', 1) RETURNING *",
        };
        const preview = payload(
            await call(
                toolCall("validate_schedule_rule", {
                    projectId: "project-1",
                    ruleId: "rule-1",
                    candidate,
                    occurrence: "2099-01-01T09:00:00Z",
                    resultLimit: 1,
                }),
            ),
        ).value;
        expect(preview).to.include({ accepted: true, persisted: false });
        expect(preview.candidateRows[0]).to.include({ id: "fixed", order: 1 });
        const wrongDestination = payload(
            await call(toolCall("validate_schedule_rule", {
                projectId: "project-1",
                candidate: {
                    ...candidate,
                    targetTableId: "audit-table",
                    sql: "INSERT INTO tasks (id, \"order\") VALUES ('wrong', 1) RETURNING *",
                },
                occurrence: "2099-01-01T09:00:00Z",
            })),
        ).value;
        expect(wrongDestination).to.include({ accepted: false });
        expect(wrongDestination.errors[0]).to.include({ code: "wrong_target_relation" });
        expect(tableConnection.document.getMap("data").size).to.equal(0);
        const denied = payload(
            await call(
                toolCall("update_schedule_rule", {
                    projectId: "project-1",
                    ruleId: "rule-1",
                    changes: { sql: candidate.sql },
                    expectedRevision: readRule.revision,
                }),
            ),
        ).value;
        expect(denied.code).to.equal("forbidden");
        write = true;
        const updated = payload(
            await call(
                toolCall("update_schedule_rule", {
                    projectId: "project-1",
                    ruleId: "rule-1",
                    changes: { sql: candidate.sql },
                    expectedRevision: readRule.revision,
                    operationId: "repair-1",
                }),
            ),
        ).value;
        expect(updated).to.include({ applied: true, replayed: false });
        const replay = payload(
            await call(
                toolCall("update_schedule_rule", {
                    projectId: "project-1",
                    ruleId: "rule-1",
                    changes: { sql: candidate.sql },
                    expectedRevision: readRule.revision,
                    operationId: "repair-1",
                }),
            ),
        ).value;
        expect(replay).to.include({ applied: false, replayed: true });
        mcpLogger.flush?.();
        await new Promise(resolve => setTimeout(resolve, 100));
        const audits = fs.readFileSync(mcpLogPath, "utf8").split("\n").filter(Boolean)
            .map(line => JSON.parse(line)).filter(line =>
                line.event === "mcp_audit" && line.tool === "update_schedule_rule" && line.outcome === "success"
            );
        expect(audits.map(line => ({ applied: line.applied, replayed: line.replayed }))).to.deep.equal([
            { applied: true, replayed: false },
            { applied: false, replayed: true },
        ]);
        const serializedAudits = JSON.stringify(audits);
        expect(serializedAudits).not.to.include(candidate.sql);
        expect(serializedAudits).not.to.include("Bearer token");
        expect(serializedAudits).not.to.include('"uid":"user"');
        const stale = payload(
            await call(
                toolCall("update_schedule_rule", {
                    projectId: "project-1",
                    ruleId: "rule-1",
                    changes: { name: "stale" },
                    expectedRevision: readRule.revision,
                }),
            ),
        ).value;
        expect(stale.code).to.equal("stale_revision");
        expect(tableConnection.document.getMap("data").size).to.equal(0);
        const reread = payload(
            await call(toolCall("get_schedule", { projectId: "project-1", ruleId: "rule-1" })),
        ).value;
        expect(reread.stored.sql).to.equal(candidate.sql);
        const executor = new JobExecutor();
        executor.startWorker();
        const generated = await executor.executeJob({
            ruleId: "rule-1",
            schemaSql,
            ruleSql: candidate.sql,
            records: [],
            timezone: "UTC",
            occurrenceUtcIso: "2099-01-01T09:00:00Z",
        });
        await executor.stopWorker();
        expect(generated.success, generated.error).to.equal(true);
        const generatedRow = generated.rows![0] as Record<string, string | number>;
        const storedRow = new Y.Map<string | number>();
        Object.entries(generatedRow).forEach(([key, value]) => storedRow.set(key, value));
        tableConnection.document.getMap("data").set(String(generatedRow.id), storedRow);
        const laterTable = payload(
            await call(toolCall("get_table", {
                projectId: "project-1",
                tableId: "table-1",
                includeRecords: true,
            })),
        ).value;
        expect(laterTable.records[0].values).to.include({ id: "fixed", order: 1 });
        await auditConnection.disconnect();
        await tableConnection.disconnect();
        await projectConnection.disconnect();
    });
});
