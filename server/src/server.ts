import http from "http";
import { WebSocketServer } from "ws";
// @ts-ignore y-websocket lacks type declarations
import setupWSConnection from "y-websocket/bin/utils";
import { type Config } from "./config";
import { logger as defaultLogger } from "./logger";
import { createPersistence, logTotalSize, warnIfRoomTooLarge } from "./persistence";
import { parseRoom } from "./room-validator";
import { extractAuthToken, verifyIdTokenCached } from "./websocket-auth";

export function startServer(config: Config, logger = defaultLogger) {
    const server = http.createServer();
    const wss = new WebSocketServer({ server });
    const persistence = createPersistence(config.LEVELDB_PATH);

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

    return { server, wss, persistence };
}
