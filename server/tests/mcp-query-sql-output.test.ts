import { expect } from "chai";
import express from "express";
import request from "supertest";
import * as Y from "yjs";
import { createMcpRouter } from "../src/mcp/mcp-api.js";
import { OutlinerReadService } from "../src/mcp/outliner-read-service.js";
import { OutlinerRelationService } from "../src/mcp/relation-service.js";
import { toolOutputSchemas } from "../src/mcp/tool-output-schemas.js";
import { Project } from "../src/schema/app-schema.js";

const envelopeMeta = {
    "io.modelcontextprotocol/protocolVersion": "2026-07-28",
    "io.modelcontextprotocol/clientCapabilities": {},
};
const rpc = (method: string, params: Record<string, unknown> = {}) => ({
    jsonrpc: "2.0",
    id: 1,
    method,
    params: { ...params, _meta: envelopeMeta },
});
const bodyOf = (response: request.Response) => {
    if (response.body?.jsonrpc) return response.body;
    const data = response.text.split("\n").find(line => line.startsWith("data: "));
    return JSON.parse(data?.slice(6) ?? "{}");
};

describe("MCP query_sql structured output", () => {
    const project = Project.createInstance("Queries");
    const rooms = new Map<string, Y.Doc>([["projects/project-1", project.ydoc]]);
    const hocuspocus = {
        openDirectConnection: async (room: string) => ({ document: rooms.get(room), disconnect: async () => {} }),
    } as never;
    const canAccess = async (_uid: string, projectId: string) => projectId === "project-1";
    const read = new OutlinerReadService(
        hocuspocus,
        canAccess,
        async () => [{ projectId: "project-1", title: "Queries" }],
    );
    const relations = new OutlinerRelationService(hocuspocus, canAccess);
    const app = express();
    app.use(express.json());
    app.use(createMcpRouter(
        read,
        () => ({ uid: "query-user", scope: "outliner.read" }),
        "http://localhost:7093",
        relations,
    ));
    const post = (method: string, name?: string) => {
        const pending = request(app).post("/mcp")
            .set("Authorization", "Bearer token")
            .set("MCP-Protocol-Version", "2026-07-28")
            .set("MCP-Method", method)
            .set("Accept", "application/json, text/event-stream");
        return name ? pending.set("MCP-Name", name) : pending;
    };

    it("advertises required name and type fields for SQL column descriptors", async () => {
        const response = await post("tools/list").send(rpc("tools/list"));
        expect(response.status).to.equal(200);
        const tool = bodyOf(response).result.tools.find((candidate: { name: string; }) =>
            candidate.name === "query_sql"
        );
        const columnItems = tool.outputSchema.properties.columns.items;

        expect(columnItems.type).to.equal("object");
        expect(columnItems.required).to.include.members(["name", "type"]);
        expect(columnItems.properties.name.type).to.equal("string");
        expect(columnItems.properties.type.type).to.equal("string");
        expect(
            toolOutputSchemas.query_sql.safeParse({
                columns: ["n"],
                rows: [{ n: 1 }],
                rowCount: 1,
                truncated: false,
            }).success,
        ).to.equal(false);
    });

    it("returns a validated descriptor array in mirrored structured output", async function() {
        this.timeout(30_000);
        const response = await post("tools/call", "query_sql").send(rpc("tools/call", {
            name: "query_sql",
            arguments: { projectId: "project-1", sql: "SELECT 1 AS n" },
        }));
        expect(response.status).to.equal(200);
        const result = bodyOf(response).result;
        const textValue = JSON.parse(result.content[0].text);

        expect(result.isError).not.to.equal(true);
        expect(result.structuredContent).to.deep.equal(textValue);
        expect(textValue.columns).to.deep.equal([{ name: "n", type: textValue.columns[0].type }]);
        expect(textValue.columns[0].type).to.be.a("string");
        expect(textValue).to.include({ rowCount: 1, truncated: false });
        expect(textValue.rows).to.deep.equal([{ n: 1 }]);
        expect(toolOutputSchemas.query_sql.safeParse(result.structuredContent).success).to.equal(true);
    });
});
