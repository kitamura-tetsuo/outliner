import { expect } from "chai";
import express from "express";
import fs from "fs";
import request from "supertest";
import * as Y from "yjs";
import { createMcpRouter } from "../src/mcp/mcp-api.js";
import { OutlinerReadService } from "../src/mcp/outliner-read-service.js";
import { OutlinerRelationService } from "../src/mcp/relation-service.js";
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

describe("MCP diagnostic-to-repair flow", () => {
    it("diagnoses, dry-runs, applies, traces, and safely audits an ordering repair", async function() {
        this.timeout(30_000);
        if (fs.existsSync(mcpLogPath)) fs.truncateSync(mcpLogPath, 0);
        const project = Project.createInstance("Canonical");
        const tableDescriptor = new Y.Map<unknown>();
        tableDescriptor.set("name", "Tasks");
        tableDescriptor.set("sqlName", "tasks");
        project.ydoc.getMap("yjsTables").set("table-1", tableDescriptor);
        const grid = new Y.Map<unknown>();
        grid.set("name", "Task order");
        grid.set("query", "SELECT id, order FROM tasks ORDER BY order");
        grid.set("sourceTableId", "table-1");
        project.ydoc.getMap("yjsGrids").set("grid-1", grid);

        const table = new Y.Doc();
        table.getText("schema").insert(0, 'CREATE TABLE tasks (id TEXT PRIMARY KEY, "order" INTEGER)');
        for (const [id, order] of [["later", 2], ["first", 1]] as const) {
            const row = new Y.Map<unknown>();
            row.set("id", id);
            row.set("order", order);
            table.getMap("data").set(id, row);
        }
        const rooms = new Map([
            ["projects/project-1", project.ydoc],
            ["projects/project-1/tables/table-1", table],
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
        const app = express();
        app.use(express.json());
        app.use(createMcpRouter(
            read,
            () => ({ uid: "canonical-user", scope: "outliner.read outliner.write" }),
            "http://localhost:7093",
            relations,
        ));
        const call = (name: string, args: Record<string, unknown>) =>
            request(app).post("/mcp").set("Authorization", "Bearer never-log-this-token")
                .set("Accept", "application/json, text/event-stream").send(rpc(name, args));

        const resolved = payload(await call("resolve_url", { url: "https://example.test/Canonical/-/tables/table-1" }));
        expect(resolved).to.include({ projectId: "project-1", kind: "table", entityId: "table-1" });
        const inspected = payload(
            await call("get_table", {
                projectId: resolved.projectId,
                tableId: resolved.entityId,
                includeRecords: true,
                recordLimit: 1,
            }),
        );
        expect(inspected.records).to.have.lengthOf(1);
        expect(inspected.page).to.include({ truncated: true, limit: 1 });

        const broken = payload(await call("trace_grid", { projectId: "project-1", gridId: "grid-1" }));
        expect(broken.stages.find((stage: { stage: string; }) => stage.stage === "query-execution")).to.include({
            status: "error",
        });
        const correctedQuery = 'SELECT id, "order" FROM tasks ORDER BY "order"';
        const validation = payload(
            await call("validate_grid_query", {
                projectId: "project-1",
                gridId: "grid-1",
                query: correctedQuery,
            }),
        );
        expect(validation).to.include({ accepted: true, inferredOrdering: "sql-order-by" });

        const currentGrid = payload(await call("get_grid", { projectId: "project-1", gridId: "grid-1" }));
        const revision = currentGrid.revision;
        const dryRun = payload(
            await call("set_view_query", {
                projectId: "project-1",
                kind: "grid",
                viewId: "grid-1",
                query: correctedQuery,
                expectedRevision: revision,
                operationId: "repair-grid-order-1",
                dryRun: true,
            }),
        );
        expect(dryRun.applied).to.equal(false);
        expect(grid.get("query")).to.equal("SELECT id, order FROM tasks ORDER BY order");

        const applied = payload(
            await call("set_view_query", {
                projectId: "project-1",
                kind: "grid",
                viewId: "grid-1",
                query: correctedQuery,
                expectedRevision: revision,
                operationId: "repair-grid-order-1",
            }),
        );
        expect(applied).to.include({ applied: true, replayed: false });
        const repaired = payload(await call("trace_grid", { projectId: "project-1", gridId: "grid-1" }));
        const execution = repaired.stages.find((stage: { stage: string; }) => stage.stage === "query-execution");
        expect(execution).to.include({ status: "completed", orderSource: "sql-order-by" });
        expect(execution.rows.map((row: { identity: { value: string; }; }) => row.identity.value)).to.deep.equal([
            "first",
            "later",
        ]);

        mcpLogger.flush?.();
        await new Promise(resolve => setTimeout(resolve, 100));
        const audits = fs.readFileSync(mcpLogPath, "utf8").split("\n").filter(Boolean)
            .map(line => JSON.parse(line)).filter(line => line.event === "mcp_audit");
        expect(audits.map(line => line.applied)).to.deep.equal([false, true]);
        expect(audits[1]).to.include({
            tool: "set_view_query",
            entity: "grid:grid-1",
            operationId: "repair-grid-order-1",
        });
        const serializedAudit = JSON.stringify(audits);
        expect(serializedAudit).not.to.include("never-log-this-token");
        expect(serializedAudit).not.to.include(correctedQuery);
        expect(serializedAudit).not.to.include("canonical-user");
    });
});
