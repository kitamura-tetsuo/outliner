import { createServer } from "node:http";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const root = dirname(fileURLToPath(import.meta.url));
const output = process.argv[2];
mkdirSync(output, { recursive: true });
let latest = {};
createServer((req, res) => {
    if (req.url === "/telemetry" && req.method === "POST") {
        let data = "";
        req.on("data", (chunk) => data += chunk);
        req.on("end", () => {
            latest = JSON.parse(data);
            writeFileSync(join(output, "browser-events.json"), JSON.stringify(latest, null, 2));
            res.end("ok");
        });
    } else if (req.url === "/state") {
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify(latest));
    } else {
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        res.end(readFileSync(join(root, "fixture.html")));
    }
}).listen(8765, "127.0.0.1");
