import { expect } from "chai";
import express from "express";
import request from "supertest";
import { createMcpRouter } from "../src/mcp/mcp-api.js";
import type { OutlinerReadService } from "../src/mcp/outliner-read-service.js";

describe("remote MCP Streamable HTTP endpoint", () => {
    const calls: { uid?: string; projectId?: string; itemId?: string; } = {};
    const service = {
        resolveUrl: (_uid: string, url: string) => ({
            projectId: url.endsWith("/alpha") ? "alpha" : "unknown",
            kind: "project",
        }),
        getItem: (uid: string, projectId: string, itemId: string) => {
            Object.assign(calls, { uid, projectId, itemId });
            return { id: itemId, kind: "text", text: "MCP item", childCount: 0 };
        },
        getSubtree: () => ({ root: { id: "root", kind: "text", text: "Root", childCount: 0 }, truncated: false }),
        getAncestors: () => [],
        searchItems: () => [],
        getGrid: () => ({}),
        getCalendar: () => ({}),
    } as unknown as OutlinerReadService;
    const app = express();
    app.use(express.json());
    app.use(createMcpRouter(service, token => {
        if (token !== "valid-access-token") throw new Error("invalid token");
        return { uid: "firebase-user-1", scope: "outliner.read offline_access" };
    }, "http://localhost:7093"));

    const rpc = (method: string, params?: Record<string, unknown>, id = 1) => ({
        jsonrpc: "2.0",
        id,
        method,
        ...(params ? { params } : {}),
    });
    const authenticatedPost = () =>
        request(app).post("/mcp")
            .set("Authorization", "Bearer valid-access-token")
            .set("Accept", "application/json, text/event-stream");
    const bodyOf = (response: request.Response) => {
        if (response.body?.jsonrpc) return response.body;
        const data = response.text.split("\n").find(line => line.startsWith("data: "));
        return JSON.parse(data?.slice(6) ?? "{}");
    };

    it("rejects missing and invalid bearer credentials", async () => {
        const missing = await request(app).post("/mcp").send(rpc("initialize"));
        expect(missing.status).to.equal(401);
        expect(missing.body).to.deep.equal({ error: "unauthenticated" });
        expect(missing.headers["www-authenticate"]).to.equal(
            'Bearer resource_metadata="http://localhost:7093/.well-known/oauth-protected-resource/mcp"',
        );

        const invalid = await request(app).post("/mcp").set("Authorization", "Bearer wrong").send(rpc("initialize"));
        expect(invalid.status).to.equal(401);
        expect(invalid.body).to.deep.equal({ error: "invalid_token" });
        expect(invalid.headers["www-authenticate"]).to.include(
            'resource_metadata="http://localhost:7093/.well-known/oauth-protected-resource/mcp"',
        );
        expect(invalid.headers["www-authenticate"]).to.include('error="invalid_token"');
    });

    it("advertises OAuth discovery to unauthenticated GET probes", async () => {
        const response = await request(app).get("/mcp");
        expect(response.status).to.equal(401);
        expect(response.body).to.deep.equal({ error: "unauthenticated" });
        expect(response.headers["www-authenticate"]).to.equal(
            'Bearer resource_metadata="http://localhost:7093/.well-known/oauth-protected-resource/mcp"',
        );

        const authenticated = await request(app).get("/mcp").set("Authorization", "Bearer valid-access-token");
        expect(authenticated.status).to.equal(405);
        expect(authenticated.headers.allow).to.equal("POST");
    });

    it("publishes OAuth protected-resource metadata for MCP client discovery", async () => {
        const metadata = await request(app).get("/.well-known/oauth-protected-resource/mcp");
        expect(metadata.status).to.equal(200);
        expect(metadata.body).to.deep.equal({
            resource: "http://localhost:7093/mcp",
            authorization_servers: ["http://localhost:7093"],
            bearer_methods_supported: ["header"],
            scopes_supported: ["outliner.read", "outliner.write"],
        });

        const compatibilityAlias = await request(app).get("/.well-known/oauth-protected-resource");
        expect(compatibilityAlias.status).to.equal(200);
        expect(compatibilityAlias.body).to.deep.equal(metadata.body);
    });

    it("rejects a valid token that was not granted the read scope", async () => {
        const scopedApp = express();
        scopedApp.use(express.json());
        scopedApp.use(
            createMcpRouter(
                service,
                () => ({ uid: "firebase-user-1", scope: "offline_access" }),
                "http://localhost:7093",
            ),
        );
        const response = await request(scopedApp).post("/mcp")
            .set("Authorization", "Bearer valid-offline-token")
            .send(rpc("tools/list"));
        expect(response.status).to.equal(403);
        expect(response.body).to.deep.equal({ error: "insufficient_scope" });
    });

    it("advertises only the seven read-only tools", async () => {
        const listed = await authenticatedPost().send(
            rpc("tools/list"),
        );
        expect(listed.status).to.equal(200);
        const tools = bodyOf(listed).result.tools;
        expect(tools.map((tool: { name: string; }) => tool.name)).to.deep.equal([
            "resolve_url",
            "get_item",
            "get_subtree",
            "get_ancestors",
            "search_items",
            "get_grid",
            "get_calendar",
        ]);
        for (const tool of tools) {
            expect(tool.annotations).to.include({ readOnlyHint: true, destructiveHint: false, idempotentHint: true });
            expect(tool._meta?.["mcp/securitySchemes"]).to.deep.equal({
                outlinerOAuth: { type: "oauth2", scopes: ["outliner.read"] },
            });
        }
    });

    it("derives the Firebase uid and returns a standards-shaped tool result", async () => {
        const result = await authenticatedPost().send(
            rpc("tools/call", { name: "get_item", arguments: { projectId: "project-1", itemId: "item-1" } }),
        );
        expect(result.status).to.equal(200);
        expect(calls).to.deep.equal({ uid: "firebase-user-1", projectId: "project-1", itemId: "item-1" });
        expect(JSON.parse(bodyOf(result).result.content[0].text)).to.deep.equal({
            id: "item-1",
            kind: "text",
            text: "MCP item",
            childCount: 0,
        });
    });

    it("does not expose mutation tools or mutation-shaped HTTP methods", async () => {
        const called = await authenticatedPost().send(
            rpc("tools/call", { name: "update_item", arguments: { projectId: "project-1", itemId: "item-1" } }),
        );
        expect(called.status).to.equal(200);
        const body = bodyOf(called);
        expect(body.result?.isError).to.equal(true);
        expect(body.result?.content?.[0]?.text).to.match(/not found/i);

        const put = await request(app).put("/mcp")
            .set("Authorization", "Bearer valid-access-token")
            .send({ projectId: "project-1" });
        expect(put.status).to.equal(405);
        expect(put.headers.allow).to.equal("POST");
        expect(put.body).to.deep.equal({ error: "method_not_allowed" });
        expect(calls).to.deep.equal({ uid: "firebase-user-1", projectId: "project-1", itemId: "item-1" });
    });
});
