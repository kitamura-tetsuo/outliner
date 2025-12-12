import http from "http";
import { WebSocketServer } from "ws";
import { type Config } from "./config";
import { logger as defaultLogger } from "./logger";
import { getMetrics, recordMessage } from "./metrics";
import { createPersistence, logTotalSize, warnIfRoomTooLarge } from "./persistence";
import { parseRoom } from "./room-validator";
import { addRoomSizeListener, removeRoomSizeListener } from "./update-listeners";
import { extractAuthToken, verifyIdTokenCached } from "./websocket-auth";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let setupWSConnection: any;

// --- Yjs protocol debug helpers (best-effort decode for logging) ---
function parseYProtocolFrame(data: unknown): {
    topType?: "sync" | "awareness" | "auth";
    syncSubtype?: "step1" | "step2" | "update";
    payloadBytes?: number;
} {
    try {
        // lazy requires to avoid hard deps in typings
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const decoding = require("lib0/decoding");
        const toUint8 = (d: any): Uint8Array => {
            if (typeof d === "string") return new TextEncoder().encode(d);
            if (Buffer.isBuffer(d)) return new Uint8Array(d);
            if (d instanceof ArrayBuffer) return new Uint8Array(d);
            if (Array.isArray(d)) return new Uint8Array(Buffer.concat(d));
            return new Uint8Array(d as Uint8Array);
        };
        const u8 = toUint8(data);
        const dec = decoding.createDecoder(u8);
        const msgType = decoding.readVarUint(dec);
        if (msgType === 0) {
            const sub = decoding.readVarUint(dec);
            if (sub === 0) {
                const sv = decoding.readVarUint8Array(dec);
                return { topType: "sync", syncSubtype: "step1", payloadBytes: sv?.length ?? 0 };
            } else if (sub === 1) {
                const upd = decoding.readVarUint8Array(dec);
                return { topType: "sync", syncSubtype: "step2", payloadBytes: upd?.length ?? 0 };
            } else if (sub === 2) {
                const upd = decoding.readVarUint8Array(dec);
                return { topType: "sync", syncSubtype: "update", payloadBytes: upd?.length ?? 0 };
            }
            return { topType: "sync" };
        } else if (msgType === 1) {
            return { topType: "awareness" };
        } else if (msgType === 2) {
            return { topType: "auth" };
        }
    } catch {
        // ignore decode failures
    }
    return {};
}

export function startServer(config: Config, logger = defaultLogger) {
    const server = http.createServer((req, res) => {
        if (req.url === "/metrics") {
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify(getMetrics(wss)));
            return;
        }

        if (req.method === "DELETE" && req.url?.startsWith("/docs/")) {
            const docName = req.url.split("/")[2];
            const secret = req.headers["x-secret-key"];

            if (secret !== config.YJS_SECRET_KEY) {
                res.writeHead(401, { "Content-Type": "text/plain" });
                res.end("Unauthorized");
                return;
            }

            if (persistence && docName) {
                persistence.clearDocument(docName).then(() => {
                    logger.info({ event: "doc_deleted", docName });
                    res.writeHead(200, { "Content-Type": "text/plain" });
                    res.end("ok");
                }).catch((err) => {
                    logger.error({ event: "doc_delete_error", docName, err });
                    res.writeHead(500, { "Content-Type": "text/plain" });
                    res.end("Internal Server Error");
                });
            } else {
                res.writeHead(400, { "Content-Type": "text/plain" });
                res.end("Bad Request");
            }
            return;
        }
        res.writeHead(200, { "Content-Type": "text/plain" });
        res.end("ok");
    });
    const wss = new WebSocketServer({ server });
    const disableLeveldb = process.env.DISABLE_Y_LEVELDB === "true";
    const persistence = disableLeveldb ? undefined : createPersistence(config.LEVELDB_PATH);
    // Configure y-websocket utils: prefer y-websocket's own utils (to match client lib), fallback to @y/websocket-server
    try {
        // y-websocket/@y/websocket-server のデフォルト永続化は YPERSISTENCE で有効化される。
        // 明示的に永続化を無効化したい場合は環境変数を設定しない。
        if (!disableLeveldb) {
            process.env.YPERSISTENCE = config.LEVELDB_PATH;
        } else {
            delete process.env.YPERSISTENCE;
        }
        ({ setupWSConnection } = require("y-websocket/bin/utils"));
    } catch {
        try {
            ({ setupWSConnection } = require("@y/websocket-server/dist/utils.cjs"));
        } catch {
            setupWSConnection = () => undefined;
        }
    }

    const ipCounts = new Map<string, number>();
    const roomCounts = new Map<string, number>();
    let totalSockets = 0;
    const allowedOrigins = new Set(
        config.ORIGIN_ALLOWLIST.split(",").map(o => o.trim()).filter(Boolean),
    );

    if (persistence) {
        setInterval(() => {
            logTotalSize(persistence, logger).catch(() => undefined);
        }, config.LEVELDB_LOG_INTERVAL_MS);
    }

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
        // 試験: docName を URL と一致させる（projects/... ページありは projects/<id>/pages/<pageId>）
        const docName = roomInfo.page
            ? `projects/${roomInfo.project}/pages/${roomInfo.page}`
            : `projects/${roomInfo.project}`;
        if ((roomCounts.get(docName) ?? 0) >= config.MAX_SOCKETS_PER_ROOM) {
            logger.warn({ event: "ws_connection_denied", reason: "max_sockets_room", room: docName });
            ws.close(4006, "MAX_SOCKETS_PER_ROOM");
            return;
        }
        totalSockets++;
        ipCounts.set(ip, (ipCounts.get(ip) ?? 0) + 1);
        roomCounts.set(docName, (roomCounts.get(docName) ?? 0) + 1);
        // Buffer messages while waiting for async auth verification
        const msgBuffer: any[] = [];
        const bufferListener = (data: any) => {
            msgBuffer.push(data);
        };
        ws.on("message", bufferListener);

        try {
            const decoded = await verifyIdTokenCached(token);

            // Remove buffer listener
            ws.removeListener("message", bufferListener);
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
            let msgCount = 0;
            let ydocRef: any | undefined = undefined;
            ws.on("message", data => {
                resetIdle();
                let size: number;
                let firstByte: number | undefined;
                let isBinary = false;
                if (typeof data === "string") {
                    size = Buffer.byteLength(data);
                } else if (Buffer.isBuffer(data)) {
                    size = data.length;
                    isBinary = true;
                    firstByte = data[0];
                } else if (data instanceof ArrayBuffer) {
                    size = data.byteLength;
                    isBinary = true;
                    firstByte = new Uint8Array(data)[0];
                } else if (Array.isArray(data)) {
                    const buf = Buffer.concat(data);
                    size = buf.length;
                    isBinary = true;
                    firstByte = buf[0];
                } else {
                    const buf = Buffer.from(data as Uint8Array);
                    size = buf.length;
                    isBinary = true;
                    firstByte = buf[0];
                }
                const parsed = parseYProtocolFrame(data);
                msgCount++;
                if (msgCount <= 10) {
                    logger.info({
                        event: "ws_message",
                        room: docName,
                        size,
                        isBinary,
                        firstByte,
                        y_type: parsed.topType,
                        y_sync_step: parsed.syncSubtype,
                        y_payload_bytes: parsed.payloadBytes,
                    });
                }

                // 可視化: sync フレーム受信直後に接続数と想定送出先数を記録（step別）
                if (isBinary && parsed.topType === "sync") {
                    const conns = roomCounts.get(docName) ?? 0;
                    const broadcastTargets = conns > 0 ? Math.max(conns - 1, 0) : 0;
                    logger.info({
                        event: "sync_receive",
                        room: docName,
                        conns,
                        broadcastTargets,
                        sync_step: parsed.syncSubtype,
                        payload_bytes: parsed.payloadBytes,
                    });
                }

                if (size > config.MAX_MESSAGE_SIZE_BYTES) {
                    logger.warn({ event: "ws_connection_closed", reason: "message_too_large", size });
                    ws.close(4005, "MESSAGE_TOO_LARGE");
                }
            });

            // Replay buffered messages
            for (const data of msgBuffer) {
                ws.emit("message", data);
            }
            // ws.send パッチで送信フレームを可視化（setupWSConnection より前に適用）
            try {
                const origSend = ws.send.bind(ws) as any;
                (ws as any).send = (data: any, ...rest: any[]) => {
                    let size = 0;
                    let firstByte: number | undefined;
                    let isBinary = false;
                    if (typeof data === "string") {
                        size = Buffer.byteLength(data);
                    } else if (Buffer.isBuffer(data)) {
                        size = data.length;
                        isBinary = true;
                        firstByte = data[0];
                    } else if (data instanceof ArrayBuffer) {
                        size = data.byteLength;
                        isBinary = true;
                        firstByte = new Uint8Array(data)[0];
                    } else if (Array.isArray(data)) {
                        const buf = Buffer.concat(data);
                        size = buf.length;
                        isBinary = true;
                        firstByte = buf[0];
                    } else if (data) {
                        const buf = Buffer.from(data as Uint8Array);
                        size = buf.length;
                        isBinary = true;
                        firstByte = buf[0];
                    }
                    const parsed = parseYProtocolFrame(data);
                    let docBytes: number | undefined = undefined;
                    try {
                        if (
                            parsed.topType === "sync"
                            && (parsed.syncSubtype === "step2" || parsed.syncSubtype === "update") && (ydocRef as any)
                        ) {
                            // eslint-disable-next-line @typescript-eslint/no-var-requires
                            const Ylib = require("yjs");
                            const enc: Uint8Array = Ylib.encodeStateAsUpdate(ydocRef);
                            docBytes = enc?.length ?? undefined;
                        }
                    } catch { /* ignore */ }
                    logger.info({
                        event: "ws_send",
                        room: docName,
                        size,
                        isBinary,
                        firstByte,
                        y_type: parsed.topType,
                        y_sync_step: parsed.syncSubtype,
                        y_payload_bytes: parsed.payloadBytes,
                        doc_bytes: docBytes,
                    });
                    return origSend(data, ...rest);
                };
            } catch { /* noop */ }

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
            if (persistence) {
                await addRoomSizeListener(persistence, docName, limitBytes, logger);
                await warnIfRoomTooLarge(persistence, docName, limitBytes, logger);
                setupWSConnection(ws, req, { docName, persistence, gc: false });
                // Debug: log server-side doc updates for this room to verify propagation
                try {
                    const ydoc = await persistence.getYDoc(docName);
                    ydocRef = ydoc;
                    ydoc.on("update", (u: Uint8Array) => {
                        logger.info({ event: "room_update", room: docName, bytes: u.length });
                    });
                    // Fallback for initial sync (v2 handshake differences): proactively send current doc update once
                    try {
                        // eslint-disable-next-line @typescript-eslint/no-var-requires
                        const Ylib = require("yjs");
                        // eslint-disable-next-line @typescript-eslint/no-var-requires
                        const enc = require("lib0/encoding");
                        const update: Uint8Array = Ylib.encodeStateAsUpdate(ydoc);
                        if (update && update.length > 0) {
                            const e = enc.createEncoder();
                            enc.writeVarUint(e, 0); // message type: sync
                            enc.writeVarUint(e, 2); // subtype: update
                            enc.writeVarUint8Array(e, update);
                            const frame = enc.toUint8Array(e);
                            (ws as any).send(frame);
                            logger.info({
                                event: "ws_send_fallback_update",
                                room: docName,
                                bytes: frame.length,
                                payload_bytes: update.length,
                            });
                        }
                    } catch { /* ignore */ }
                } catch { /* ignore */ }
                ws.on("close", () => {
                    removeRoomSizeListener(persistence, docName).catch(() => undefined);
                });
            } else {
                setupWSConnection(ws, req, { docName, gc: false });
            }
            ws.on("message", () => recordMessage());
        } catch (err) {
            totalSockets--;
            ipCounts.set(ip, (ipCounts.get(ip) ?? 1) - 1);
            if (ipCounts.get(ip)! <= 0) ipCounts.delete(ip);
            roomCounts.set(docName, (roomCounts.get(docName) ?? 1) - 1);
            if (roomCounts.get(docName)! <= 0) roomCounts.delete(docName);
            const message = err instanceof Error ? err.message : String(err);
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const code = (err as any)?.code || (err as any)?.errorInfo?.code || undefined;
            logger.warn({ event: "ws_connection_denied", reason: "invalid_token", code, message });
            ws.close(4001, "UNAUTHORIZED");
        }
    });

    // Bind to IPv4 to ensure Chromium (Playwright) can reach the server even if IPv6-only sockets are not routed
    server.listen(config.PORT, "0.0.0.0", () => {
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
