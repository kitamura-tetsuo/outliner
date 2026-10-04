import crypto from "crypto";
import express from "express";
import fs from "fs-extra";
import { AsyncLocalStorage } from "node:async_hooks";
import request from "supertest";
import {
    type GridPresentationUpdateOptions,
    type GridPresentationUpdateResult,
    OutlinerGridPresentationService,
    type UpdateGridPresentationRequest,
} from "../src/mcp/grid-presentation.js";
import { createMcpRouter } from "../src/mcp/mcp-api.js";
import { OutlinerReadService } from "../src/mcp/outliner-read-service.js";
import { UpdateGridPresentationTool } from "../src/mcp/update-grid-presentation-tool.js";
import { signAccessToken } from "../src/oauth/tokens.js";
import { createDocumentStore, type DocumentStore } from "../src/persistence.js";
import { AclStore, startTestServer, stopTestServer, tempDir, type TestServer } from "./server-create-table-fixture.js";
import { PROJECT, seedGridProject } from "./server-grid-presentation-fixture.js";

/**
 * Shared fixture for the MCP `update_grid_presentation` regressions (issue
 * #5436).
 *
 * Every call goes through the real MCP `tools/list` / `tools/call`
 * registration and dispatch path (createMcpRouter) with real OAuth access
 * tokens, the real relation/read services, and the real server presentation
 * boundary (OutlinerGridPresentationService) of a startServer() instance that
 * uses production SQLite persistence and the real resource-side ACL adapter.
 *
 * `seamApp()` mounts a router whose presentation tool has observable seams
 * that never replace production behaviour: a retention clock, a per-request
 * ACL gate (runs before the real ACL read, so revocations are honoured), a
 * barrier before the domain attempt, a storage wrapper that can fail after
 * the real store ran, and a delivery hook that observes or corrupts the
 * established outcome. `production` is the unmodified production endpoint of
 * the same server.
 */
export const UID = "grid-presentation-mcp-user";

export function token(uid = UID, scope = "outliner.read outliner.write") {
    return signAccessToken({ uid, scope, clientId: "mcp-grid-presentation-test" }).token;
}

export interface PresentationSeams {
    /** Awaited by the ACL check of the given request, before the real ACL read. */
    gate?: (requestId: string, check: number) => Promise<void> | void;
    /** Awaited before the domain attempt runs (applies only, never dry runs). */
    beforeAttempt?: () => Promise<void> | void;
    /** Runs after the real durable store; throwing makes that store unconfirmed. */
    afterStore?: (room: string) => Promise<void> | void;
    now?: () => number;
    /** Observes or replaces the established domain outcome (fault injection). */
    deliver?: (outcome: GridPresentationUpdateResult) => GridPresentationUpdateResult;
}

export async function startGridMcpFixture() {
    const acl = new AclStore();
    acl.grant("projectUsers", PROJECT, UID);
    const dir = tempDir();
    const server: TestServer = await startTestServer(dir, acl);
    await seedGridProject(server.hocuspocus);
    const context = new AsyncLocalStorage<string>();
    const checks = new Map<string, number>();
    let domainCalls = 0;
    const seams: PresentationSeams = {};
    const gatedAccess = async (uid: string, projectId: string) => {
        const requestId = context.getStore() ?? "";
        const check = (checks.get(requestId) ?? 0) + 1;
        checks.set(requestId, check);
        await seams.gate?.(requestId, check);
        return acl.checkAccess(uid, projectId);
    };
    const realStore = createDocumentStore(server.persistence!);
    const store: DocumentStore = async (room, doc) => {
        await realStore(room, doc);
        await seams.afterStore?.(room);
    };
    const service = new OutlinerGridPresentationService(server.hocuspocus, gatedAccess, store);
    const domain = {
        updatePresentation: async (
            uid: string,
            req: UpdateGridPresentationRequest,
            options: GridPresentationUpdateOptions = {},
        ) => {
            if (!req.dryRun) {
                domainCalls++;
                await seams.beforeAttempt?.();
            }
            const outcome = await service.updatePresentation(uid, req, options);
            return seams.deliver ? seams.deliver(outcome) : outcome;
        },
    };
    const tool = new UpdateGridPresentationTool(domain, gatedAccess, () => (seams.now ?? Date.now)());
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => context.run(req.header("x-request-id") ?? "", next));
    const reads = new OutlinerReadService(server.hocuspocus, gatedAccess, async () => []);
    app.use(createMcpRouter(reads, undefined, undefined, server.mcpRelations, undefined, undefined, tool));
    const mcp = rpcClient(app);
    return {
        acl,
        dir,
        server,
        seams,
        checks,
        mcp,
        /** The unmodified production endpoint of the same server. */
        production: rpcClient(server.server),
        get domainCalls() {
            return domainCalls;
        },
        async stop() {
            await stopTestServer(server);
            await fs.remove(dir);
        },
    };
}

export type GridMcpFixture = Awaited<ReturnType<typeof startGridMcpFixture>>;

export function rpcClient(target: Parameters<typeof request>[0]) {
    const rpc = async (method: string, params: object, options: { requestId?: string; bearer?: string; } = {}) => {
        const response = await request(target).post("/mcp")
            .set("x-request-id", options.requestId ?? `req-${crypto.randomUUID()}`)
            .set("Authorization", `Bearer ${options.bearer ?? token()}`)
            .set("Accept", "application/json, text/event-stream")
            .send({ jsonrpc: "2.0", id: 1, method, params });
        const body = response.body?.jsonrpc
            ? response.body
            : JSON.parse(response.text.split("\n").find(line => line.startsWith("data: "))!.slice(6));
        return body.result;
    };
    const call = async (name: string, args: object, options: { requestId?: string; bearer?: string; } = {}) => {
        const result = await rpc("tools/call", { name, arguments: args }, options);
        return { result, payload: JSON.parse(result.content[0].text) };
    };
    return { rpc, call };
}

export function updateArgs(overrides: Record<string, unknown> = {}) {
    return {
        projectId: PROJECT,
        gridId: "grid-tasks",
        expectedPresentationRevision: "",
        changes: { components: { title: { label: "件名" } } },
        operationId: `op-${crypto.randomUUID()}`,
        ...overrides,
    };
}

export function deferred() {
    let resolve!: () => void;
    const promise = new Promise<void>(done => resolve = done);
    return { promise, resolve };
}

/** Drain every pending microtask (in-process ACL reads and cache joins are microtask-only). */
export const settleMicrotasks = () => new Promise(resolve => setImmediate(resolve));
