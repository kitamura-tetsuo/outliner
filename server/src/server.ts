import http from "http";
import { WebSocketServer } from "ws";
import { type Config } from "./config";
import { logger as defaultLogger } from "./logger";

export function startServer(config: Config, logger = defaultLogger) {
    const server = http.createServer();
    const wss = new WebSocketServer({ server });

    wss.on("connection", () => {
        // connection established
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
