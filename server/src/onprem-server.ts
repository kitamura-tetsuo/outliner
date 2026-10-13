import { Logger } from "@hocuspocus/extension-logger";
import { Hocuspocus } from "@hocuspocus/server";
import cors from "cors";
import express from "express";
import http from "node:http";
import path from "node:path";
import { WebSocketServer } from "ws";
import type { Config } from "./config.js";
import { createLocalAuthFromEnv, LOCAL_USER_ID, parseLocalSessionId } from "./local-auth.js";
import { logger as defaultLogger } from "./logger.js";
import { createDocumentStore, createPersistence } from "./persistence.js";
import { createLocalSqliteProjectDirectoryProvider } from "./project-directory-sqlite.js";
import { ProjectDirectoryError } from "./project-directory.js";
import { parseRoom } from "./room-validator.js";

interface LocalContext {
    sessionId: string;
    user: { uid: typeof LOCAL_USER_ID; };
}

const LOCAL_ID = /^[A-Za-z0-9_-]{1,128}$/;

function statusFor(error: unknown): number {
    if (!(error instanceof ProjectDirectoryError)) return 500;
    if (error.code === "not_found") return 404;
    if (error.code === "storage_unavailable") return 503;
    if (["ambiguous_title", "duplicate_title", "title_conflict"].includes(error.code)) return 409;
    return 400;
}

export async function startOnPremServer(config: Config, logger = defaultLogger) {
    if (config.OUTLINER_DEPLOYMENT_MODE !== "onprem" || !config.OUTLINER_DATA_DIR) {
        throw new Error("On-premises server requires validated onprem configuration");
    }
    const auth = createLocalAuthFromEnv();
    const directory = createLocalSqliteProjectDirectoryProvider(
        path.join(config.OUTLINER_DATA_DIR, "projects.sqlite"),
    );
    // Probe the database before any listener can report readiness. The
    // provider deliberately preserves corrupt/unreadable files as failures.
    directory.assertWritable();
    const persistence = await createPersistence(config).catch(error => {
        directory.close();
        throw error;
    });
    if (!persistence) {
        directory.close();
        throw new Error("On-premises document persistence is unavailable");
    }

    const hocuspocus = new Hocuspocus({
        name: "outliner-onprem",
        extensions: [new Logger({}), persistence] as import("@hocuspocus/server").Extension[],
        debounce: 0,
        async onAuthenticate(data): Promise<LocalContext> {
            const sessionId = parseLocalSessionId(data.requestHeaders.get("cookie") ?? undefined);
            if (!auth.resolveSessionUser(sessionId)) {
                throw Object.assign(new Error("Authentication required"), { code: 4001 });
            }
            const room = parseRoom(data.documentName);
            if (!room || !await directory.checkAccess(LOCAL_USER_ID, room.project)) {
                throw Object.assign(new Error("Access denied"), { code: 4003 });
            }
            return { sessionId: sessionId!, user: { uid: LOCAL_USER_ID } };
        },
        async beforeHandleMessage(data) {
            if (!auth.resolveSessionUser(data.context.sessionId)) {
                data.connection.close({ code: 4001, reason: "Session revoked" });
                throw new Error("Session revoked");
            }
        },
    } as Partial<import("@hocuspocus/server").Configuration<LocalContext>>);
    // Hocuspocus dispatches extension configuration asynchronously even
    // though its constructor is synchronous.
    await new Promise<void>(resolve => setImmediate(resolve));
    if (!persistence.db) {
        directory.close();
        throw new Error("On-premises document database failed to open");
    }
    const assertStorageReady = () => {
        directory.assertWritable();
        if (!persistence.db?.open) throw new Error("Document storage is unavailable");
        persistence.db.exec("BEGIN IMMEDIATE");
        try {
            persistence.db.prepare("SELECT name FROM documents LIMIT 1").get();
        } finally {
            if (persistence.db.inTransaction) persistence.db.exec("ROLLBACK");
        }
    };
    assertStorageReady();

    const app = express();
    app.use(cors({ credentials: true, origin: true }));
    app.use(express.json());
    app.get("/health", (_req, res) => {
        try {
            assertStorageReady();
            res.json({ status: "ok", ready: true });
        } catch {
            res.status(503).json({ status: "not-ready", ready: false });
        }
    });
    app.get("/api/deployment", (_req, res) =>
        res.json({
            deploymentMode: "onprem",
            supportedFeatures: ["projects", "outline", "tables", "grids"],
        }));
    app.use("/api", auth.router);
    app.use("/api/projects", (req, res, next) => {
        if (!auth.resolveRequestUser(req)) {
            res.status(401).json({ error: "Unauthorized" });
            return;
        }
        next();
    });
    const respond = (res: express.Response, operation: () => Promise<unknown>, success = 200) => {
        operation().then(value => res.status(success).json(value)).catch(error =>
            res.status(statusFor(error)).json({ error: error instanceof Error ? error.message : "Request failed" })
        );
    };
    app.get("/api/projects", (_req, res) =>
        respond(res, async () => ({
            projects: await directory.listDescriptors(LOCAL_USER_ID),
        })));
    app.get(
        "/api/projects/resolve",
        (req, res) => respond(res, () => directory.resolveTitle(LOCAL_USER_ID, req.query.title)),
    );
    app.get(
        "/api/projects/:projectId",
        (req, res) => respond(res, () => directory.getDescriptor(LOCAL_USER_ID, req.params.projectId)),
    );
    app.post(
        "/api/projects",
        (req, res) => {
            if (typeof req.body?.projectId !== "string" || !LOCAL_ID.test(req.body.projectId)) {
                res.status(400).json({ error: "Invalid projectId" });
                return;
            }
            respond(res, () => directory.ensureDescriptor(LOCAL_USER_ID, req.body.projectId, req.body?.title), 201);
        },
    );
    app.post(
        "/api/projects/:projectId/rename",
        (req, res) => respond(res, () => directory.rename(LOCAL_USER_ID, req.params.projectId, req.body?.title)),
    );

    // Cloud-only APIs are intentionally absent; this terminal handler makes
    // unsupported local operations explicit before any cloud side effect.
    app.use("/api", (_req, res) => res.status(501).json({ error: "Unsupported in onprem mode" }));
    const server = http.createServer(app);
    const wss = new WebSocketServer({ noServer: true });
    server.on("upgrade", (request, socket, head) => {
        const roomName = request.url?.split("?")[0]?.replace(/^\/+/, "") ?? "";
        if (!parseRoom(roomName)) {
            socket.destroy();
            return;
        }
        wss.handleUpgrade(request, socket, head, ws => {
            const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);
            const webRequest = new Request(url, { headers: request.headers as Record<string, string> });
            const connection = hocuspocus.handleConnection(ws, webRequest, {} as LocalContext);
            ws.on("message", message => connection.handleMessage(Buffer.from(message as ArrayBuffer)));
            ws.on("close", (code, reason) => connection.handleClose({ code, reason: reason.toString() }));
        });
    });
    await new Promise<void>((resolve, reject) => {
        server.once("error", reject);
        server.listen(config.PORT, "0.0.0.0", resolve);
    });
    let stopping = false;
    const shutdown = async () => {
        if (stopping) return;
        stopping = true;
        // Stop accepting HTTP/upgrades first, but do not wait for existing
        // WebSockets until their already-applied state has been persisted.
        const closed = new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
        hocuspocus.flushPendingStores();
        const store = createDocumentStore(persistence);
        await Promise.all([...hocuspocus.documents].map(([name, document]) => store(name, document)));
        hocuspocus.closeConnections();
        for (const client of wss.clients) client.close(1001, "Server shutting down");
        await closed;
        persistence.db?.close();
        directory.close();
        logger.info("On-premises server shut down cleanly");
    };
    return { server, hocuspocus, persistence, shutdown };
}
