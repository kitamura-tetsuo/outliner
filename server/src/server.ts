import http from "http";
import { WebSocketServer } from "ws";
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
    const server = http.createServer((_req, res) => {
        res.writeHead(200, { "Content-Type": "text/plain" });
        res.end("ok");
    });
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
            const limitBytes = config.LEVELDB_ROOM_SIZE_WARN_MB * 1024 * 1024;
            await addRoomSizeListener(persistence, docName, limitBytes, logger);
            await warnIfRoomTooLarge(persistence, docName, limitBytes, logger);
            setupWSConnection(ws, req, { docName, persistence });
            ws.on("close", () => {
                removeRoomSizeListener(persistence, docName).catch(() => undefined);
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

    return { server, wss, persistence };
}
