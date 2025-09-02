import http from "http";
import { WebSocketServer } from "ws";
import { getMetrics, recordMessage } from "./metrics";
// y-websocket utilities may not export setupWSConnection in all builds
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let setupWSConnection: any;
try {
    // @ts-ignore fallback for CommonJS build
    setupWSConnection = require("y-websocket/bin/utils");
} catch {
    setupWSConnection = () => undefined;
}
import { type Config } from "./config";
import { logger as defaultLogger } from "./logger";
import { createPersistence, logTotalSize, warnIfRoomTooLarge } from "./persistence";
import { parseRoom } from "./room-validator";
import { addRoomSizeListener, removeRoomSizeListener } from "./update-listeners";
import { extractAuthToken, verifyIdTokenCached } from "./websocket-auth";

export function startServer(config: Config, logger = defaultLogger) {
    const server = http.createServer((req, res) => {
        if (req.url === "/metrics") {
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify(getMetrics(wss)));
            return;
        }
        res.writeHead(200, { "Content-Type": "text/plain" });
        res.end("ok");
    });
    const wss = new WebSocketServer({ server });
    const persistence = createPersistence(config.LEVELDB_PATH);
    const ipCounts = new Map<string, number>();
    const roomCounts = new Map<string, number>();
    let totalSockets = 0;
    const allowedOrigins = new Set(
        config.ORIGIN_ALLOWLIST.split(",").map(o => o.trim()).filter(Boolean),
    );

    setInterval(() => {
        logTotalSize(persistence, logger).catch(() => undefined);
    }, config.LEVELDB_LOG_INTERVAL_MS);

    wss.on("connection", async (ws, req) => {
        const ip = req.socket.remoteAddress ?? "";
        const origin = req.headers.origin ?? "";
        if (allowedOrigins.size && !allowedOrigins.has(origin)) {
            logger.warn({ event: "ws_connection_denied", reason: "invalid_origin", origin });
            ws.close(4003, "ORIGIN_NOT_ALLOWED");
            return;
        }
        if (totalSockets >= config.MAX_SOCKETS_TOTAL) {
            logger.warn({ event: "ws_connection_denied", reason: "max_sockets_total" });
            ws.close(4006, "MAX_SOCKETS_TOTAL");
            return;
        }
        if ((ipCounts.get(ip) ?? 0) >= config.MAX_SOCKETS_PER_IP) {
            logger.warn({ event: "ws_connection_denied", reason: "max_sockets_ip", ip });
            ws.close(4006, "MAX_SOCKETS_PER_IP");
            return;
        }
        const token = extractAuthToken(req);
        if (!token) {
            logger.warn({ event: "ws_connection_denied", reason: "missing_token" });
            ws.close(4001, "UNAUTHORIZED");
            return;
        }
        const roomInfo = parseRoom(req.url ?? "/");
        if (!roomInfo) {
            logger.warn({ event: "ws_connection_denied", reason: "invalid_room", path: req.url });
            ws.close(4002, "INVALID_ROOM");
            return;
        }
        const docName = roomInfo.page ? `${roomInfo.project}/${roomInfo.page}` : roomInfo.project;
        if ((roomCounts.get(docName) ?? 0) >= config.MAX_SOCKETS_PER_ROOM) {
            logger.warn({ event: "ws_connection_denied", reason: "max_sockets_room", room: docName });
            ws.close(4006, "MAX_SOCKETS_PER_ROOM");
            return;
        }
        totalSockets++;
        ipCounts.set(ip, (ipCounts.get(ip) ?? 0) + 1);
        roomCounts.set(docName, (roomCounts.get(docName) ?? 0) + 1);
        try {
            const decoded = await verifyIdTokenCached(token);
            let idleTimer = setTimeout(() => {
                logger.warn({ event: "ws_connection_closed", reason: "idle_timeout" });
                ws.close(4004, "IDLE_TIMEOUT");
            }, config.IDLE_TIMEOUT_MS);
            const resetIdle = () => {
                clearTimeout(idleTimer);
                idleTimer = setTimeout(() => {
                    logger.warn({ event: "ws_connection_closed", reason: "idle_timeout" });
                    ws.close(4004, "IDLE_TIMEOUT");
                }, config.IDLE_TIMEOUT_MS);
            };
            ws.on("message", data => {
                resetIdle();
                let size: number;
                if (typeof data === "string") {
                    size = Buffer.byteLength(data);
                } else if (Buffer.isBuffer(data)) {
                    size = data.length;
                } else if (data instanceof ArrayBuffer) {
                    size = data.byteLength;
                } else if (Array.isArray(data)) {
                    size = Buffer.concat(data).length;
                } else {
                    size = Buffer.from(data as Uint8Array).length;
                }
                if (size > config.MAX_MESSAGE_SIZE_BYTES) {
                    logger.warn({ event: "ws_connection_closed", reason: "message_too_large", size });
                    ws.close(4005, "MESSAGE_TOO_LARGE");
                }
            });
            ws.on("close", () => {
                clearTimeout(idleTimer);
                totalSockets--;
                ipCounts.set(ip, (ipCounts.get(ip) ?? 1) - 1);
                if (ipCounts.get(ip)! <= 0) ipCounts.delete(ip);
                roomCounts.set(docName, (roomCounts.get(docName) ?? 1) - 1);
                if (roomCounts.get(docName)! <= 0) roomCounts.delete(docName);
            });
            logger.info({ event: "ws_connection_accepted", uid: decoded.uid, room: docName });
            const limitBytes = config.LEVELDB_ROOM_SIZE_WARN_MB * 1024 * 1024;
            await addRoomSizeListener(persistence, docName, limitBytes, logger);
            await warnIfRoomTooLarge(persistence, docName, limitBytes, logger);
            setupWSConnection(ws, req, { docName, persistence });
            ws.on("message", () => recordMessage());
            ws.on("close", () => {
                removeRoomSizeListener(persistence, docName).catch(() => undefined);
            });
        } catch {
            totalSockets--;
            ipCounts.set(ip, (ipCounts.get(ip) ?? 1) - 1);
            if (ipCounts.get(ip)! <= 0) ipCounts.delete(ip);
            roomCounts.set(docName, (roomCounts.get(docName) ?? 1) - 1);
            if (roomCounts.get(docName)! <= 0) roomCounts.delete(docName);
            logger.warn({ event: "ws_connection_denied", reason: "invalid_token" });
            ws.close(4001, "UNAUTHORIZED");
        }
    });

    server.listen(config.PORT, "::", () => {
        logger.info({ port: config.PORT }, "y-websocket server listening");
    });

    const shutdown = () => {
        wss.close();
        server.close(() => process.exit(0));
    };
    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);

    return { server, wss, persistence };
}
