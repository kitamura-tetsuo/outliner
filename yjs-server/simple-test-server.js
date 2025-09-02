#!/usr/bin/env node

// 簡単なYjsテストサーバー
import { WebSocketServer } from "ws";
import { setupWSConnection } from "y-websocket/bin/utils";

const PORT = process.env.PORT || 1234;
const HOST = process.env.HOST || "0.0.0.0";

console.log(`Starting simple Yjs test server on ${HOST}:${PORT}...`);

// WebSocketサーバーの作成
const wss = new WebSocketServer({
    port: PORT,
    host: HOST,
});

console.log(`Yjs WebSocket server listening on ${HOST}:${PORT}`);

// 接続統計
const stats = {
    connections: 0,
    rooms: new Set(),
};

// WebSocket接続の処理
wss.on("connection", (ws, req) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const roomName = url.pathname.slice(1); // '/'を除去

    console.log(`New connection to room: ${roomName}`);

    // 統計を更新
    stats.connections++;
    stats.rooms.add(roomName);

    // y-websocketのセットアップ
    setupWSConnection(ws, req);

    // 接続終了時の処理
    ws.on("close", () => {
        stats.connections--;
        console.log(`Connection closed. Active connections: ${stats.connections}`);
    });

    ws.on("error", (error) => {
        console.error("WebSocket error:", error);
    });
});

// サーバーエラーハンドリング
wss.on("error", (error) => {
    console.error("WebSocket server error:", error);
});

// 統計情報を定期的に出力
setInterval(() => {
    console.log(`Stats - Connections: ${stats.connections}, Rooms: ${stats.rooms.size}`);
}, 30000);

// グレースフルシャットダウン
process.on("SIGINT", () => {
    console.log("\nShutting down server...");
    wss.close(() => {
        console.log("Server closed");
        process.exit(0);
    });
});

process.on("SIGTERM", () => {
    console.log("Received SIGTERM, shutting down gracefully...");
    process.kill(process.pid, "SIGINT");
});

console.log("Simple Yjs server started successfully");
