import http from "http";
import { WebSocketServer } from "ws";
import { type Config } from "./config";
import { logger as defaultLogger } from "./logger";
import { extractAuthToken, verifyIdTokenCached } from "./websocket-auth";

export function startServer(config: Config, logger = defaultLogger) {
    const server = http.createServer();
    const wss = new WebSocketServer({ server });

    wss.on("connection", async (ws, req) => {
        const token = extractAuthToken(req);
        if (!token) {
            logger.warn({ event: "ws_connection_denied", reason: "missing_token" });
            ws.close(4001, "UNAUTHORIZED");
            return;
        }
        try {
            const decoded = await verifyIdTokenCached(token);
            logger.info({ event: "ws_connection_accepted", uid: decoded.uid });
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

    return { server, wss };
}
