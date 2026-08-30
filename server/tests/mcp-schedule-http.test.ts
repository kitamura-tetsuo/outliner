import { Hocuspocus } from "@hocuspocus/server";
import { expect } from "chai";
import express from "express";
import request from "supertest";
import * as Y from "yjs";
import { createMcpRouter } from "../src/mcp/mcp-api.js";
import { OutlinerReadService } from "../src/mcp/outliner-read-service.js";
import { OutlinerRelationService } from "../src/mcp/relation-service.js";
import { OutlinerScheduleService } from "../src/mcp/schedule-service.js";
import { Project } from "../src/schema/app-schema.js";

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
        const hocuspocus = new Hocuspocus({ quiet: true });
        const projectConnection = await hocuspocus.openDirectConnection("projects/project-1", {
            context: { uid: "user" },
        });
        const project = Project.fromDoc(projectConnection.document);
        const table = new Y.Map<unknown>();
        table.set("name", "Tasks");
        table.set("sqlName", "tasks");
        project.ydoc.getMap("yjsTables").set("table-1", table);
        const rule = new Y.Map<unknown>();
        for (
            const [key, value] of Object.entries({
                name: "Daily",
                targetTableId: "table-1",
                sql: "INSERT INTO tasks (id) VALUES ('daily') RETURNING *",
                rrule: "FREQ=DAILY",
                dtstart: "2099-01-01T09:00:00",
                timezone: "UTC",
                enabled: true,
                catchUp: false,
            })
        ) rule.set(key, value);
        project.schedules.set("rule-1", rule as never);
        const tableConnection = await hocuspocus.openDirectConnection("projects/project-1/tables/table-1", {
            context: { uid: "user" },
        });
        tableConnection.document.getText("schema").insert(0, "CREATE TABLE tasks (id TEXT PRIMARY KEY)");
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
        const candidate = { ...readRule.stored, sql: "INSERT INTO tasks (id) VALUES ('fixed') RETURNING *" };
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
        expect(replay).to.include({ replayed: true });
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
        await tableConnection.disconnect();
        await projectConnection.disconnect();
    });
});
