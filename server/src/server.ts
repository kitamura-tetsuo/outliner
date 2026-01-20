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
import { createPersistence } from "./persistence.js";
import { parseRoom } from "./room-validator.js";
import { createSeedRouter } from "./seed-api.js";
import {
    refreshClientLogStream,
    refreshServerLogStream,
    refreshTelemetryLogStream,
    rotateClientLogs,
    rotateServerLogs,
    rotateTelemetryLogs,
} from "./utils/log-manager.js";
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

    const disablePersistence = process.env.DISABLE_PERSISTENCE === "true";
    const persistence = disablePersistence ? undefined : await createPersistence(config);

    // Additional check to ensure Persistence is ready
    if (persistence) {
        logger.info({ event: "persistence_ready" }, "Persistence initialized");
    }

    const intervals: NodeJS.Timeout[] = [];

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

    const extensions = [
        new Logger({}),
    ];

    if (persistence) {
        extensions.push(persistence);
    }

    const hocuspocus = new Hocuspocus({
        name: "hocuspocus-fluid-outliner",
        extensions: extensions as any[],
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
    app.use("/api", createSeedRouter(hocuspocus));

    // Log rotation endpoint
    app.post("/api/rotate-logs", async (req: any, res: any) => {
        try {
            const clientRotated = await rotateClientLogs(2);
            const telemetryRotated = await rotateTelemetryLogs(2);
            const serverRotated = await rotateServerLogs(2);

            if (clientRotated) {
                refreshClientLogStream();
            }
            if (telemetryRotated) {
                refreshTelemetryLogStream();
            }
            if (serverRotated) {
                refreshServerLogStream();
            }

            res.status(200).json({
                success: true,
                clientRotated,
                telemetryRotated,
                serverRotated,
                timestamp: new Date().toISOString(),
            });

            logger.info(`Log rotation completed: ${
                JSON.stringify({
                    clientRotated,
                    telemetryRotated,
                    serverRotated,
                    timestamp: new Date().toISOString(),
                })
            }`);
        } catch (error: any) {
            logger.error(`Log rotation error: ${error.message}`);
            res.status(500).json({
                success: false,
                error: error.message,
            });
        }
    });

    // Explicitly handle upgrade requests to ensure Hocuspocus receives them
    server.on("upgrade", async (request, socket, head) => {
        // SECURITY: Apply authentication and validation to ALL WebSocket upgrades.
        // Previously, only /projects/ paths were validated, allowing bypass via other paths.
        wss.handleUpgrade(request, socket, head, async (ws: any) => {
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
                    // Handle leading slash and double slashes gracefully
                    documentName = path.replace(/^\/+/, "");
                }

                if (!token) throw new Error("Authentication failed: No token provided");

                const room = parseRoom(documentName);
                if (!room?.project) throw new Error("Authentication failed: Invalid room format");

                let decoded;
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
                            documentName, // Add context
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
                        user: { uid: decoded.uid },
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
    });

    // Listen
    server.listen(config.PORT, "0.0.0.0", () => {
        logger.info({ port: config.PORT }, "Hocuspocus server listening");
    });

    const shutdown = () => {
        intervals.forEach(clearInterval);
        if (typeof (hocuspocus as any).destroy === "function") {
            (hocuspocus as any).destroy();
        } else {
            hocuspocus.closeConnections();
        }
        return new Promise<void>((resolve) => {
            server.close(() => resolve());
        });
    };

    return { server, hocuspocus, persistence, shutdown };
}
