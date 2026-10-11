import express from "express";
import fs from "fs-extra";
import { AsyncLocalStorage } from "node:async_hooks";
import request from "supertest";
import * as Y from "yjs";
import { CreateTableTool } from "../src/mcp/create-table-tool.js";
import { createMcpRouter } from "../src/mcp/mcp-api.js";
import { OutlinerReadService } from "../src/mcp/outliner-read-service.js";
import { OutlinerRelationService } from "../src/mcp/relation-service.js";
import {
    type CreateTableOptions,
    type CreateTableOutcome,
    type CreateTableRequest,
    OutlinerTableCreationService,
} from "../src/mcp/table-creation.js";
import { signAccessToken } from "../src/oauth/tokens.js";
import { createDocumentStore, type DocumentStore } from "../src/persistence.js";
import { mcpLogger, mcpLogPath } from "../src/utils/log-manager.js";
import {
    AclStore,
    seedProject,
    startTestServer,
    stopTestServer,
    tempDir,
    type TestServer,
    withRoom,
} from "./server-create-table-fixture.js";

/**
 * Shared fixture for the MCP create_table regressions (issue #5412).
 *
 * Every call goes through the real MCP `tools/list` / `tools/call`
 * registration and dispatch path (createMcpRouter) with real OAuth access
 * tokens, the real relation service, and the real server creation boundary
 * (OutlinerTableCreationService) of a startServer() instance that uses
 * production SQLite persistence and the real resource-side ACL adapter.
 *
 * `mcpApp()` mounts a router whose create_table tool has observable seams that
 * never replace production behaviour: a retention clock, a per-request ACL
 * gate (runs before the real ACL read, so revocations are honoured), a
 * barrier before publication, and a storage wrapper that can fail after the
 * real store ran. `server.server` is the unmodified production endpoint.
 */
export const UID = "mcp-table-user";
export const PROJECT = "proj-a";
export const SCHEMA = "CREATE TABLE mcp_tasks (id TEXT PRIMARY KEY, title TEXT NOT NULL, done BOOLEAN)";

export function token(uid = UID, scope = "outliner.read outliner.write") {
    return signAccessToken({ uid, scope, clientId: "mcp-create-table-test" }).token;
}

export interface Seams {
    /** Awaited by the ACL check of the given request, before the real ACL read. */
    gate?: (requestId: string, check: number) => Promise<void> | void;
    beforePublication?: () => Promise<void>;
    /** Runs after the real durable store; throwing makes that store unconfirmed. */
    afterStore?: (room: string) => Promise<void> | void;
    now?: () => number;
    /** A delivery seam: rewrites the outcome after the real domain call established it. */
    deliver?: (outcome: CreateTableOutcome) => CreateTableOutcome;
    beforeRecordBatchPublication?: () => Promise<void>;
    beforeGridQueryPublication?: () => Promise<void>;
}

export async function startMcpTestServer() {
    const acl = new AclStore();
    acl.grant("projectUsers", PROJECT, UID);
    const dir = tempDir();
    const server = await startTestServer(dir, acl);
    await seedProject(server.hocuspocus, PROJECT);
    const context = new AsyncLocalStorage<string>();
    const checks = new Map<string, number>();
    let domainCalls = 0;
    const seams: Seams = {};
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
    const creation = new OutlinerTableCreationService(server.hocuspocus, gatedAccess, store);
    const domain = {
        createTable: async (uid: string, projectId: string, req: CreateTableRequest, options?: CreateTableOptions) => {
            if (!req.dryRun) domainCalls++;
            const outcome = await creation.createTable(uid, projectId, req, {
                ...options,
                beforePublication: async () => {
                    if (!req.dryRun) await seams.beforePublication?.();
                },
            });
            return seams.deliver ? seams.deliver(outcome) : outcome;
        },
    };
    const tool = new CreateTableTool(domain, gatedAccess, () => (seams.now ?? Date.now)());
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => context.run(req.header("x-request-id") ?? "", next));
    const reads = new OutlinerReadService(server.hocuspocus, gatedAccess, async () => []);
    const relations = new OutlinerRelationService(server.hocuspocus, gatedAccess, {
        beforeRecordBatchPublication: () => seams.beforeRecordBatchPublication?.() ?? Promise.resolve(),
        beforeGridQueryPublication: () => seams.beforeGridQueryPublication?.() ?? Promise.resolve(),
    });
    app.use(createMcpRouter(reads, undefined, undefined, relations, undefined, tool));
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
        tables: () => withRoom(server.hocuspocus, `projects/${PROJECT}`, registry),
        async stop() {
            await stopTestServer(server);
            await fs.remove(dir);
        },
    };
}

export type McpTestServer = Awaited<ReturnType<typeof startMcpTestServer>>;

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

export function createArgs(overrides: Record<string, unknown> = {}) {
    return {
        projectId: PROJECT,
        name: "MCP Tasks",
        schemaSql: SCHEMA,
        operationId: `op-${crypto.randomUUID()}`,
        ...overrides,
    };
}

/** The live registry: tableId -> { name, sqlName }. */
export function registry(doc: Y.Doc) {
    return Object.fromEntries(
        [...doc.getMap<Y.Map<unknown>>("yjsTables").entries()].map(([id, entry]) => [id, {
            name: entry.get("name"),
            sqlName: entry.get("sqlName"),
        }]),
    );
}

/** Durable mcp_audit records for the given operation IDs, in order. */
export async function auditRecords(operationIds: string[]) {
    await new Promise<void>((resolve, reject) => mcpLogger.flush(error => error ? reject(error) : resolve()));
    return fs.readFileSync(mcpLogPath, "utf8").split("\n").filter(Boolean)
        .map(line => JSON.parse(line))
        .filter(record => record.event === "mcp_audit" && operationIds.includes(record.operationId));
}

export function deferred() {
    let resolve!: () => void;
    const promise = new Promise<void>(done => resolve = done);
    return { promise, resolve };
}

/** Drain every pending microtask (in-process ACL reads and cache joins are microtask-only). */
export const settleMicrotasks = () => new Promise(resolve => setImmediate(resolve));

export type { TestServer };
export { startTestServer, stopTestServer };
