import http from "http";
import pino from "pino";
import { WebSocketServer } from "ws";
import { type Config } from "./config";

export function startServer(config: Config) {
    const logger = pino({ level: config.LOG_LEVEL });
    const server = http.createServer();
    const wss = new WebSocketServer({ server });

    wss.on("connection", () => {
        // connection established
    });

    server.listen(config.PORT, "::", () => {
        logger.info(`y-websocket server listening on :::${config.PORT}`);
    });

    const shutdown = () => {
        wss.close();
        server.close(() => process.exit(0));
    };
    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);

    return { server, wss };
}
