import express from "express";
import { AsyncLocalStorage } from "node:async_hooks";
import request from "supertest";
import { createMcpRouter } from "../src/mcp/mcp-api.js";
import { createGridFixture } from "./mcp-create-grid-fixture.js";

export function httpGridFixture() {
    const context = new AsyncLocalStorage<string>();
    const access = { allowed: true, denied: new Set<string>(), checked: (_request: string) => {} };
    const f = createGridFixture(async () => {
        const requestId = context.getStore() ?? "";
        access.checked(requestId);
        return access.allowed && !access.denied.has(requestId);
    });
    const app = (scope = "outliner.read outliner.write") => {
        const app = express();
        app.use(express.json());
        app.use((req, _res, next) => context.run(req.header("x-request-id") ?? "", next));
        app.use(createMcpRouter(f.reads, () => ({ uid: "private-grid-user", scope }), "http://localhost", f.relations));
        return app;
    };
    const server = app();
    const rpc = async (method: string, params: object, target = server, requestId = "grid-request") => {
        const response = await request(target).post("/mcp")
            .set("x-request-id", requestId)
            .set("Authorization", "Bearer private-grid-token")
            .set("Accept", "application/json, text/event-stream")
            .send({ jsonrpc: "2.0", id: 1, method, params });
        const body = response.body?.jsonrpc
            ? response.body
            : JSON.parse(response.text.split("\n").find(line => line.startsWith("data: "))!.slice(6));
        return body.result;
    };
    const call = async (name: string, args: object, target = server, requestId = "grid-request") => {
        const result = await rpc("tools/call", { name, arguments: args }, target, requestId);
        return { ...result, payload: JSON.parse(result.content[0].text) };
    };
    const args = {
        projectId: "project-1",
        tableId: "table-tasks",
        pageId: f.page.id,
        query: "SELECT id AS id, title AS title FROM tasks ORDER BY id",
        operationId: "create-grid-1",
    };
    return { ...f, access, app, rpc, call, args };
}
