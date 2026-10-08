import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
const root = dirname(fileURLToPath(import.meta.url));
const output = process.argv[2];
mkdirSync(output, { recursive: true });
let latest = {};
let activeSession;
const retiredSessions = new Set();
createServer((req, res) => {
    if (["/telemetry", "/session"].includes(req.url) && req.method === "POST") {
        let data = "";
        req.on("data", (chunk) => data += chunk);
        req.on("end", () => {
            const incoming = JSON.parse(data);
            if (req.url === "/session" && !retiredSessions.has(incoming.sessionId)) {
                if (activeSession) retiredSessions.add(activeSession);
                activeSession = incoming.sessionId;
                latest = {};
            } else if (
                req.url === "/telemetry" && incoming.sessionId === activeSession
                && (incoming.sequence ?? 0) >= (latest.sequence ?? 0)
            ) latest = incoming;
            writeFileSync(join(output, "browser-events.json"), JSON.stringify(latest, null, 2));
            res.end("ok");
        });
    } else if (req.url === "/state") {
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        res.end(JSON.stringify(latest));
    } else {
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        res.end(readFileSync(join(root, "fixture.html")));
    }
}).listen(8765, "127.0.0.1");
