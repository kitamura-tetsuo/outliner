import { Logger } from "@hocuspocus/extension-logger";
console.log("DEBUG: LOADING server/src/server.ts");
import { Hocuspocus, Server } from "@hocuspocus/server";
import express from "express";
import helmet from "helmet";
import http from "http";
import { WebSocketServer } from "ws";
import * as Y from "yjs";
import { checkContainerAccess as defaultCheckAccess } from "./access-control.js";
import { type Config } from "./config.js";
import { logger as defaultLogger } from "./logger.js";
import { getMetrics, recordMessage } from "./metrics.js";
import { createPersistence, logTotalSize } from "./persistence.js";
import { parseRoom } from "./room-validator.js";
import { createSeedRouter } from "./seed-api.js";
import { sanitizeUrl } from "./utils/sanitize.js";
import { extractAuthToken, verifyIdTokenCached as defaultVerifyToken } from "./websocket-auth.js";

interface ServerOverrides {
    checkContainerAccess?: typeof defaultCheckAccess;
    verifyIdTokenCached?: typeof defaultVerifyToken;
}

export async function startServer(
    config: Config,
    logger = defaultLogger,
    overrides: ServerOverrides = {},
) {
    const checkContainerAccess = overrides.checkContainerAccess || defaultCheckAccess;
    const verifyIdTokenCached = overrides.verifyIdTokenCached || defaultVerifyToken;

    // Create Express app for API endpoints
    const app = express();

    // Add security headers
    // @ts-ignore
    app.use((helmet as any)());

    // Add JSON body parser middleware
    app.use(express.json());

    const server = http.createServer(app);

    const disableLeveldb = process.env.DISABLE_Y_LEVELDB === "true";
    // const persistence = disableLeveldb ? undefined : await createPersistence(config.LEVELDB_PATH);
    const persistence = undefined;

    // Additional check to ensure LevelDB is fully opened before accepting requests
    if (persistence) {
        try {
            // Force a read operation to ensure database is fully opened
            // This also triggers any lazy initialization
            if (persistence) {
                const healthDoc = await (persistence as any).getYDoc("_health_check_");
                logger.info({ event: "persistence_ready" }, "LevelDB persistence ready");
                // Clean up the health check doc by deleting it if it was created
                if (healthDoc) {
                    try {
                        healthDoc.destroy();
                    } catch {}
                }
            }
        } catch (e: any) {
            logger.warn(
                { event: "persistence_init_warning", error: e.message },
                "Persistence initialization warning - continuing anyway",
            );
        }
    }

    const intervals: NodeJS.Timeout[] = [];

    if (persistence) {
        intervals.push(setInterval(() => {
            logTotalSize(persistence, logger).catch(() => undefined);
        }, config.LEVELDB_LOG_INTERVAL_MS));
    }

    // Detailed Health/Debug endpoint
    app.get("/health", (req: any, res: any) => {
        const headers = { ...req.headers };
        // Redact sensitive headers
        delete headers.authorization;
        delete headers.cookie;

        res.json({
            status: "ok",
            env: process.env.NODE_ENV,
            timestamp: new Date().toISOString(),
            headers: headers,
        });
    });
    // Configure y-websocket persistence
    if (!disableLeveldb) {
        process.env.YPERSISTENCE = config.LEVELDB_PATH;
    } else {
        delete process.env.YPERSISTENCE;
    }

    // Rate limiting state
    const ipCounts = new Map<string, number>();
    const roomCounts = new Map<string, number>();
    const connectionRateLimits = new Map<string, number[]>();
    let totalSockets = 0;
    const allowedOrigins = new Set(
        config.ORIGIN_ALLOWLIST.split(",").map(o => o.trim()).filter(Boolean),
    );

    // Rate limiter cleanup interval
    intervals.push(setInterval(() => {
        const now = Date.now();
        const windowStart = now - config.RATE_LIMIT_WINDOW_MS;
        for (const [ip, timestamps] of connectionRateLimits) {
            const valid = timestamps.filter(t => t > windowStart);
            if (valid.length === 0) {
                connectionRateLimits.delete(ip);
            } else if (valid.length < timestamps.length) {
                connectionRateLimits.set(ip, valid);
            }
        }
    }, config.RATE_LIMIT_WINDOW_MS * 5));

    // Message size limit extension
    const onMessageExtension = {
        async onMessage({ message, connection }: any) {
            recordMessage();
            if (message.byteLength > config.MAX_MESSAGE_SIZE_BYTES) {
                logger.warn({
                    event: "ws_connection_closed",
                    reason: "message_too_large",
                    size: message.byteLength,
                });
                connection.close(4005, "MESSAGE_TOO_LARGE");
            }
        },
    } as any;

    const hocuspocus = new Hocuspocus({
        name: "hocuspocus-fluid-outliner",

        extensions: [
            new Logger({}),
            onMessageExtension,
            {
                async onAuthenticate(data: any) {
                    const { request, documentName, token: socketToken } = data;
                    console.log(`DEBUG: onAuthenticate triggered for ${documentName}, hasSocketToken=${!!socketToken}`);
                    let connection = data.connection;

                    if (!connection) {
                        // Try to recover connection
                        if (data.instance && data.socketId && data.instance.connections) {
                            connection = data.instance.connections.get(data.socketId);
                        }
                    }

                    const token = socketToken || extractAuthToken(request);
                    if (!token) {
                        connection?.close(4001, "UNAUTHORIZED");
                        throw new Error("Authentication failed: No token provided");
                    }

                    const room = parseRoom(documentName);
                    if (!room?.project) {
                        connection?.close(4002, "INVALID_ROOM");
                        throw new Error("Authentication failed: Invalid room format");
                    }

                    let decoded;
                    try {
                        decoded = await verifyIdTokenCached(token);
                    } catch (err) {
                        connection?.close(4001, "UNAUTHORIZED");
                        throw err;
                    }

                    const hasAccess = await checkContainerAccess(decoded.uid, room.project);

                    if (!hasAccess) {
                        connection?.close(4003, "FORBIDDEN");
                        throw new Error("Authentication failed: Access denied");
                    }

                    console.log(`DEBUG: onAuthenticate returning user=${decoded.uid}`);
                    return {
                        user: { uid: decoded.uid },
                        room,
                    };
                },

                async onLoadDocument({ documentName }: { documentName: string; }) {
                    // First, check if we have a cached document from seed API
                    // This is needed because persistence is currently disabled
                    const docs = (hocuspocus as any).documents;
                    logger.info({
                        event: "onLoadDocument_start",
                        documentName,
                        hasDocs: !!docs,
                        docsSize: docs?.size ?? 0,
                        hasDocument: docs?.has(documentName) ?? false,
                    });

                    if (docs && docs.has(documentName)) {
                        const cached = docs.get(documentName);
                        logger.info({
                            event: "onLoadDocument_cache_hit",
                            documentName,
                            hasCached: !!cached,
                            hasDocument: !!cached?.document,
                        });
                        if (cached && cached.document) {
                            logger.info(
                                { event: "load_cached_document", documentName },
                                "Using cached document from seed API",
                            );
                            return cached.document;
                        }
                    }

                    logger.info({ event: "onLoadDocument_no_cache", documentName });
                    if (!persistence) {
                        logger.info(
                            { event: "onLoadDocument_new_doc", documentName },
                            "Creating new Y.Doc (no persistence)",
                        );
                        return new Y.Doc();
                    }
                    const doc = await (persistence as any).getYDoc(documentName);

                    // Bind persistence to the document to save updates automatically
                    // y-leveldb's bindState listens to 'update' events
                    await (persistence as any).bindState(documentName, doc);

                    // Room Size Warning Listener
                    const limitBytes = config.LEVELDB_ROOM_SIZE_WARN_MB * 1024 * 1024;
                    const checkSize = () => {
                        // This might be expensive for large docs, but it matches previous behavior
                        // Ideally this should be debounced
                        const size = Y.encodeStateAsUpdate(doc).byteLength;
                        if (size > limitBytes) {
                            logger.warn({ event: "room_size_exceeded", room: documentName, bytes: size });
                        }
                    };

                    // Attach listener similar to update-listeners.ts
                    try {
                        const ymap: any = doc.getMap("orderedTree");
                        if (ymap && typeof ymap.observeDeep === "function") {
                            ymap.observeDeep(checkSize);
                        } else {
                            doc.on("update", checkSize);
                        }
                    } catch {
                        doc.on("update", checkSize);
                    }

                    return doc;
                },

                async onConnect(data: any) {
                    console.log("DEBUG: onConnect triggered");
                    const { request, documentName, connection, context } = data;
                    logger.warn({ event: "DEBUG_onConnect", documentName, url: request.url });

                    // AUTH CHECK (Consistency with onAuthenticate)
                    // If user is already in context (from onAuthenticate or upgrade), skip URL token check
                    if (!context?.user) {
                        const token = extractAuthToken(request);
                        if (!token) {
                            // Defer to onAuthenticate (message based auth)
                            logger.info({ event: "ws_connect_no_token", msg: "Waiting for auth message" });
                        }
                    }

                    // Helper to close connection properly and return early
                    // We close the raw WebSocket FIRST to ensure close event is emitted
                    // before Hocuspocus sets up its internal handlers
                    const closeWithReason = (code: number, reason: string) => {
                        // Get the raw WebSocket - stored on request.__ws during upgrade handler
                        let ws = (request as any)?.__ws;

                        // Fallback: try to get socket from connection
                        if (!ws && (connection as any)?.webSocket) {
                            ws = (connection as any).webSocket;
                        }

                        logger.warn({ event: "DEBUG_closeWithReason", code, reason, hasWs: !!ws });
                        if (ws) {
                            // Close raw WebSocket FIRST to ensure close event is emitted
                            // Hocuspocus hasn't fully set up its handlers yet at this point
                            try {
                                ws.close(code, reason);
                            } catch (e) {
                                logger.error({ event: "ws_close_error", error: e });
                            }
                        }
                        // Then let Hocuspocus handle its internal cleanup
                        if (connection) {
                            try {
                                connection.close({ code, reason });
                            } catch {}
                        }
                    };

                    const ip = (request.headers["x-forwarded-for"] as string) || request.socket.remoteAddress || "";
                    const origin = request.headers.origin || "";

                    logger.warn({ event: "DEBUG_onConnect_details", ip, totalSockets });

                    // Store IP in connection context for onDisconnect
                    // Use data.context if connection.context is not available
                    if (connection) {
                        (connection as any).context = { ...((connection as any).context || {}), ip };
                    } else if (data.context) {
                        data.context.ip = ip;
                    }

                    // Rate Limiting Check
                    const now = Date.now();
                    const windowStart = now - config.RATE_LIMIT_WINDOW_MS;
                    let timestamps = connectionRateLimits.get(ip) || [];
                    timestamps = timestamps.filter(t => t > windowStart);

                    if (timestamps.length >= config.RATE_LIMIT_MAX_REQUESTS) {
                        logger.warn({ event: "ws_connection_denied", reason: "rate_limit_exceeded", ip });
                        closeWithReason(4004, "RATE_LIMIT_EXCEEDED");
                        throw new Error("RATE_LIMIT_EXCEEDED");
                    }
                    timestamps.push(now);
                    connectionRateLimits.set(ip, timestamps);

                    if (allowedOrigins.size && !allowedOrigins.has(origin)) {
                        logger.warn({ event: "ws_connection_denied", reason: "invalid_origin", origin });
                        closeWithReason(4003, "ORIGIN_NOT_ALLOWED");
                        throw new Error("ORIGIN_NOT_ALLOWED");
                    }
                    if (totalSockets >= config.MAX_SOCKETS_TOTAL) {
                        logger.warn({ event: "ws_connection_denied", reason: "max_sockets_total" });
                        closeWithReason(4008, "MAX_SOCKETS_TOTAL");
                        throw new Error("MAX_SOCKETS_TOTAL");
                    }
                    if ((ipCounts.get(ip) ?? 0) >= config.MAX_SOCKETS_PER_IP) {
                        logger.warn({ event: "ws_connection_denied", reason: "max_sockets_ip", ip });
                        closeWithReason(4008, "MAX_SOCKETS_PER_IP");
                        throw new Error("MAX_SOCKETS_PER_IP");
                    }

                    // Check room limits
                    // Fallback for empty documentName (possible Hocuspocus issue)
                    let roomName = documentName;
                    if (!roomName && request.url) {
                        const path = request.url.split("?")[0];
                        roomName = path.startsWith("/") ? path.slice(1) : path;
                        logger.info({ event: "ws_connect_name_fallback", original: documentName, derived: roomName });
                    }

                    // Hocuspocus documentName IS the room/docName
                    const roomInfo = parseRoom(roomName);
                    // Note: documentName passed to onConnect is the one from URL
                    if (!roomInfo) {
                        logger.warn({
                            event: "ws_connection_denied",
                            reason: "invalid_room",
                            path: sanitizeUrl(request.url),
                            documentName,
                            roomName,
                        });
                        closeWithReason(4002, "INVALID_ROOM");
                        throw new Error("INVALID_ROOM");
                    }

                    const currentRoomCount = roomCounts.get(roomName) ?? 0;
                    const maxRoom = config.MAX_SOCKETS_PER_ROOM;
                    logger.warn({ event: "DEBUG_RoomCheck", room: roomName, count: currentRoomCount, max: maxRoom });

                    if (currentRoomCount >= maxRoom) {
                        logger.warn({ event: "DEBUG_Rejecting", room: roomName });
                        logger.warn({ event: "ws_connection_denied", reason: "max_sockets_room", room: roomName });
                        closeWithReason(4006, "MAX_SOCKETS_PER_ROOM");
                        throw new Error("MAX_SOCKETS_PER_ROOM");
                    }

                    // Increment counters
                    totalSockets++;
                    ipCounts.set(ip, (ipCounts.get(ip) ?? 0) + 1);
                    roomCounts.set(roomName, (roomCounts.get(roomName) ?? 0) + 1);

                    logger.info({ event: "ws_connection_accepted", room: roomName });
                },

                async onDisconnect(data: any) {
                    const { documentName } = data;
                    const connection = data.connection;

                    // Context might be in data.context or connection.context
                    const context = data.context || (connection as any)?.context || {};
                    const ip = context.ip || "";

                    // Decrement counters
                    totalSockets--;
                    if (totalSockets < 0) totalSockets = 0;

                    if (ip) {
                        const count = (ipCounts.get(ip) ?? 1) - 1;
                        if (count <= 0) ipCounts.delete(ip);
                        else ipCounts.set(ip, count);
                    }

                    if (documentName) {
                        const count = (roomCounts.get(documentName) ?? 1) - 1;
                        if (count <= 0) roomCounts.delete(documentName);
                        else roomCounts.set(documentName, count);
                    }
                },
            },
        ],
    } as any);

    const wss = new WebSocketServer({ noServer: true });

    // API Routes
    app.get("/", (_req, res) => {
        res.send("ok");
    });

    app.get("/health", (req, res) => {
        const headers = { ...req.headers };
        res.json({
            status: "ok",
            env: process.env.NODE_ENV,
            timestamp: new Date().toISOString(),
            headers: headers,
        });
    });

    app.get("/metrics", (_req, res) => {
        res.json(getMetrics(hocuspocus as any));
    });

    // Seed API - use Hocuspocus's openDirectConnection for proper document lifecycle
    app.use("/api", createSeedRouter(hocuspocus, persistence));

    // Explicitly handle upgrade requests to ensure Hocuspocus receives them
    server.on("upgrade", async (request, socket, head) => {
        if (request.url?.startsWith("/projects/")) {
            wss.handleUpgrade(request, socket, head, async (ws: any) => {
                logger.warn({ event: "DEBUG_handleUpgrade_callback", url: request.url });
                (request as any).__ws = ws;

                // --- Manual Connection Handling (Hooks Replacement) ---
                const ip = (request.headers["x-forwarded-for"] as string) || request.socket.remoteAddress || "";
                const origin = request.headers.origin || "";

                // Helper to close
                const reject = (code: number, reason: string) => {
                    logger.warn({ event: "ws_connection_denied", reason, code, ip });
                    ws.close(code, reason);
                };

                try {
                    // 1. Rate Limiting
                    const now = Date.now();
                    const windowStart = now - config.RATE_LIMIT_WINDOW_MS;
                    let timestamps = connectionRateLimits.get(ip) || [];
                    timestamps = timestamps.filter(t => t > windowStart);
                    if (timestamps.length >= config.RATE_LIMIT_MAX_REQUESTS) {
                        return reject(4004, "RATE_LIMIT_EXCEEDED");
                    }
                    timestamps.push(now);
                    connectionRateLimits.set(ip, timestamps);

                    if (allowedOrigins.size && !allowedOrigins.has(origin)) {
                        return reject(4003, "ORIGIN_NOT_ALLOWED");
                    }
                    if (totalSockets >= config.MAX_SOCKETS_TOTAL) {
                        return reject(4008, "MAX_SOCKETS_TOTAL");
                    }
                    if ((ipCounts.get(ip) ?? 0) >= config.MAX_SOCKETS_PER_IP) {
                        return reject(4008, "MAX_SOCKETS_PER_IP");
                    }

                    // 2. Room Parsing & Auth
                    const token = extractAuthToken(request);
                    // documentName extraction
                    let documentName = "";
                    if (request.url) {
                        const path = request.url.split("?")[0];
                        documentName = path.startsWith("/") ? path.slice(1) : path;
                    }

                    // if (!token) throw new Error("Authentication failed: No token provided");

                    const room = parseRoom(documentName);
                    if (!room?.project) throw new Error("Authentication failed: Invalid room format");

                    let decoded;
                    if (token) {
                        try {
                            decoded = await verifyIdTokenCached(token);
                        } catch (err) {
                            ws.close(4001, "UNAUTHORIZED");
                            return;
                        }

                        const hasAccess = await checkContainerAccess(decoded.uid, room.project);
                        if (!hasAccess) {
                            ws.close(4003, "FORBIDDEN");
                            return;
                        }
                    } else {
                        logger.warn({
                            event: "ws_no_token_in_url",
                            msg: "Deferring auth to Hocuspocus onAuthenticate",
                        });
                    }

                    // 3. Room Limits

                    // 3. Room Limits
                    const currentRoomCount = roomCounts.get(documentName) ?? 0;
                    if (currentRoomCount >= config.MAX_SOCKETS_PER_ROOM) {
                        return reject(4006, "MAX_SOCKETS_PER_ROOM");
                    }

                    // 4. Update Counters
                    totalSockets++;
                    ipCounts.set(ip, (ipCounts.get(ip) ?? 0) + 1);
                    roomCounts.set(documentName, (roomCounts.get(documentName) ?? 0) + 1);

                    logger.info({ event: "ws_connection_accepted", room: documentName });

                    // 5. Setup Listeners
                    ws.on("message", (data: any) => {
                        recordMessage();
                        const len = data.byteLength || data.length || 0;
                        if (len > config.MAX_MESSAGE_SIZE_BYTES) {
                            logger.warn({
                                event: "ws_connection_closed",
                                reason: "message_too_large",
                                size: len,
                            });
                            ws.close(4005, "MESSAGE_TOO_LARGE");
                        }
                    });

                    ws.on("close", () => {
                        totalSockets--;
                        if (totalSockets < 0) totalSockets = 0;
                        if (ip) {
                            const count = (ipCounts.get(ip) ?? 1) - 1;
                            if (count <= 0) ipCounts.delete(ip);
                            else ipCounts.set(ip, count);
                        }
                        if (documentName) {
                            const count = (roomCounts.get(documentName) ?? 1) - 1;
                            if (count <= 0) roomCounts.delete(documentName);
                            else roomCounts.set(documentName, count);
                        }
                    });

                    // 6. Handover to Hocuspocus
                    try {
                        // Pass auth context
                        const context = {
                            user: decoded ? { uid: decoded.uid } : undefined,
                            room,
                            ip,
                        };
                        hocuspocus.handleConnection(ws, request, context);
                    } catch (e) {
                        console.error("Error handling Hocuspocus connection:", e);
                        ws.close(1011);
                    }
                } catch (e: any) {
                    logger.error({ event: "ws_setup_error", error: e.message });
                    ws.close(4001, e.message || "Unauthorized");
                }
            });
        } else {
            // Let other handlers or default behavior handle it (usually closes socket)
            // But usually server.on('upgrade') listeners check specific paths.
            // If we don't have other WS services:
            if (request.url === "/" || request.url?.startsWith("/api")) {
                // Ignore standard HTTP paths? No, Upgrade is specific.
            }
            // For now, assume all upgrades are for Hocuspocus if they look like project usage
            // Actually, Hocuspocus usually handles any path.
            wss.handleUpgrade(request, socket, head, (ws) => {
                hocuspocus.handleConnection(ws, request, {});
            });
        }
    });

    // Listen
    server.listen(config.PORT, "0.0.0.0", () => {
        logger.info({ port: config.PORT }, "Hocuspocus server listening");
    });

    const shutdown = () => {
        intervals.forEach(clearInterval);
        (hocuspocus as any).destroy();
        return new Promise<void>((resolve) => {
            server.close(() => resolve());
        });
    };

    return { server, hocuspocus, persistence, shutdown };
}
