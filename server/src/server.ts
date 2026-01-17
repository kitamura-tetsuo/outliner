import { Logger } from "@hocuspocus/extension-logger";
import { Server } from "@hocuspocus/server";
import express from "express";
import http from "http";
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
    app.use(express.json());

    const server = http.createServer(app);

    const disableLeveldb = process.env.DISABLE_Y_LEVELDB === "true";
    const persistence = disableLeveldb ? undefined : await createPersistence(config.LEVELDB_PATH);

    const intervals: NodeJS.Timeout[] = [];

    if (persistence) {
        intervals.push(setInterval(() => {
            logTotalSize(persistence, logger).catch(() => undefined);
        }, config.LEVELDB_LOG_INTERVAL_MS));
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

    const hocuspocus = new Server({
        name: "hocuspocus-fluid-outliner",
        // Hocuspocus handles the server internally if we call listen(), but we want to bind to existing http server
        // We will call handleUpgrade manually.

        extensions: [
            new Logger({
                // Using a no-op log or mapping to our logger could be useful
                // For now, let's keep it simple.
                // Hocuspocus logger logs to console by default.
            }),
            {
                async onMessage({ message, connection }: any) {
                    recordMessage();
                    if (message.byteLength > config.MAX_MESSAGE_SIZE_BYTES) {
                        logger.warn({
                            event: "ws_connection_closed",
                            reason: "message_too_large",
                            size: message.byteLength,
                        });
                        connection.close({ code: 4005, reason: "MESSAGE_TOO_LARGE" });
                    }
                },
            } as any,
        ],

        async onAuthenticate({ request, documentName, token: socketToken, connection }: any) {
            const token = socketToken || extractAuthToken(request);
            if (!token) {
                connection.close(4001, "UNAUTHORIZED");
                throw new Error("Authentication failed: No token provided");
            }

            const room = parseRoom(documentName);
            if (!room?.project) {
                connection.close(4002, "INVALID_ROOM");
                throw new Error("Authentication failed: Invalid room format");
            }

            let decoded;
            try {
                decoded = await verifyIdTokenCached(token);
            } catch (err) {
                connection.close(4001, "UNAUTHORIZED");
                throw err;
            }

            const hasAccess = await checkContainerAccess(decoded.uid, room.project);

            if (!hasAccess) {
                connection.close(4003, "FORBIDDEN");
                throw new Error("Authentication failed: Access denied");
            }

            return {
                user: { uid: decoded.uid },
                room,
            };
        },

        async onLoadDocument({ documentName }) {
            if (!persistence) {
                return new Y.Doc();
            }
            const doc = await persistence.getYDoc(documentName);

            // Bind persistence to the document to save updates automatically
            // y-leveldb's bindState listens to 'update' events
            await persistence.bindState(documentName, doc);

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

        async onConnect({ request, documentName, connection }: any) {
            const ip = (request.headers["x-forwarded-for"] as string) || request.socket.remoteAddress || "";
            const origin = request.headers.origin || "";

            // Store IP in connection context for onDisconnect
            (connection as any).context = { ...((connection as any).context || {}), ip };

            // Rate Limiting Check
            const now = Date.now();
            const windowStart = now - config.RATE_LIMIT_WINDOW_MS;
            let timestamps = connectionRateLimits.get(ip) || [];
            timestamps = timestamps.filter(t => t > windowStart);

            if (timestamps.length >= config.RATE_LIMIT_MAX_REQUESTS) {
                logger.warn({ event: "ws_connection_denied", reason: "rate_limit_exceeded", ip });
                throw new Error("RATE_LIMIT_EXCEEDED");
            }
            timestamps.push(now);
            connectionRateLimits.set(ip, timestamps);

            if (allowedOrigins.size && !allowedOrigins.has(origin)) {
                logger.warn({ event: "ws_connection_denied", reason: "invalid_origin", origin });
                throw new Error("ORIGIN_NOT_ALLOWED");
            }
            if (totalSockets >= config.MAX_SOCKETS_TOTAL) {
                logger.warn({ event: "ws_connection_denied", reason: "max_sockets_total" });
                throw new Error("MAX_SOCKETS_TOTAL");
            }
            if ((ipCounts.get(ip) ?? 0) >= config.MAX_SOCKETS_PER_IP) {
                logger.warn({ event: "ws_connection_denied", reason: "max_sockets_ip", ip });
                throw new Error("MAX_SOCKETS_PER_IP");
            }

            // Check room limits
            // Hocuspocus documentName IS the room/docName
            const roomInfo = parseRoom(documentName);
            // Note: documentName passed to onConnect is the one from URL
            if (!roomInfo) {
                logger.warn({ event: "ws_connection_denied", reason: "invalid_room", path: sanitizeUrl(request.url) });
                throw new Error("INVALID_ROOM");
            }

            if ((roomCounts.get(documentName) ?? 0) >= config.MAX_SOCKETS_PER_ROOM) {
                logger.warn({ event: "ws_connection_denied", reason: "max_sockets_room", room: documentName });
                throw new Error("MAX_SOCKETS_PER_ROOM");
            }

            // Increment counters
            totalSockets++;
            ipCounts.set(ip, (ipCounts.get(ip) ?? 0) + 1);
            roomCounts.set(documentName, (roomCounts.get(documentName) ?? 0) + 1);

            logger.info({ event: "ws_connection_accepted", room: documentName });
        },

        async onDisconnect({ documentName, connection }: any) {
            const ip = (connection as any).context?.ip || "";

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
    });

    // Handle WebSocket upgrade manually
    server.on("upgrade", (request, socket, head) => {
        (hocuspocus as any).handleUpgrade(request, socket, head);
    });

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
        res.json(getMetrics(hocuspocus));
    });

    // Seed API
    const getYDoc = (name: string) => {
        if ((hocuspocus as any).hocuspocus.documents.has(name)) {
            return (hocuspocus as any).hocuspocus.documents.get(name)!.document;
        }
        if (persistence) {
            return persistence.getYDoc(name);
        }
        return new Y.Doc();
    };
    app.use("/api", createSeedRouter(persistence, getYDoc));

    // Listen
    server.listen(config.PORT, "0.0.0.0", () => {
        logger.info({ port: config.PORT }, "Hocuspocus server listening");
    });

    const shutdown = () => {
        intervals.forEach(clearInterval);
        hocuspocus.destroy();
        return new Promise<void>((resolve) => {
            server.close(() => resolve());
        });
    };

    return { server, hocuspocus, persistence, shutdown };
}
