import admin from "firebase-admin";
import http from "http";
import { WebSocketServer } from "ws";
import { type Config } from "./config";
import { logger as defaultLogger } from "./logger";
import { createPersistence, logTotalSize, warnIfRoomTooLarge } from "./persistence";
import { parseRoom } from "./room-validator";
import { extractAuthToken, verifyIdTokenCached } from "./websocket-auth";

export function startServer(config: Config, logger = defaultLogger, autoReady = true) {
    let isReady = false;
    const markReady = () => {
        isReady = true;
    };
    const roomCounts = new Map<string, number>();
    let openSockets = 0;
    // Lazy load y-websocket setup, fallback to noop if unavailable
    let setupWSConnection: any;
    try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        setupWSConnection = require("y-websocket/bin/utils");
    } catch {
        setupWSConnection = () => undefined;
    }
    const server = http.createServer((req, res) => {
        if (req.method !== "GET") {
            res.writeHead(405).end();
            return;
        }
        switch (req.url) {
            case "/livez": {
                res.writeHead(200).end("OK");
                return;
            }
            case "/readyz": {
                if (isReady && admin.apps.length > 0) {
                    res.writeHead(200).end("READY");
                } else {
                    res.writeHead(503).end("NOT_READY");
                }
                return;
            }
            case "/metrics": {
                const body = JSON.stringify({ sockets: openSockets, rooms: roomCounts.size });
                res.writeHead(200, { "Content-Type": "application/json" }).end(body);
                return;
            }
            default:
                res.writeHead(404).end();
        }
    });
    const wss = new WebSocketServer({ server });
    const persistence = createPersistence(config.LEVELDB_PATH);
    if (autoReady) {
        markReady();
    }

    setInterval(() => {
        logTotalSize(persistence, logger).catch(() => undefined);
    }, config.LEVELDB_LOG_INTERVAL_MS);

    wss.on("connection", async (ws, req) => {
        const token = extractAuthToken(req);
        if (!token) {
            logger.warn({ event: "ws_connection_denied", reason: "missing_token" });
            ws.close(4001, "UNAUTHORIZED");
            return;
        }
        try {
            const decoded = await verifyIdTokenCached(token);
            const roomInfo = parseRoom(req.url ?? "/");
            if (!roomInfo) {
                logger.warn({ event: "ws_connection_denied", reason: "invalid_room", path: req.url });
                ws.close(4002, "INVALID_ROOM");
                return;
            }
            const docName = roomInfo.page ? `${roomInfo.project}/${roomInfo.page}` : roomInfo.project;
            logger.info({ event: "ws_connection_accepted", uid: decoded.uid, room: docName });
            openSockets++;
            roomCounts.set(docName, (roomCounts.get(docName) ?? 0) + 1);
            const warn = () =>
                warnIfRoomTooLarge(
                    persistence,
                    docName,
                    config.LEVELDB_ROOM_SIZE_WARN_MB * 1024 * 1024,
                    logger,
                );
            const doc = await persistence.getYDoc(docName);
            doc.on("update", warn);
            await warn();
            setupWSConnection(ws, req, { docName, persistence });
            ws.on("close", () => {
                openSockets--;
                const cnt = (roomCounts.get(docName) ?? 1) - 1;
                if (cnt <= 0) {
                    roomCounts.delete(docName);
                } else {
                    roomCounts.set(docName, cnt);
                }
            });
        } catch {
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

    return { server, wss, persistence, markReady };
}
