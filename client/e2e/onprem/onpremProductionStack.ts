import fs from "node:fs";
import http from "node:http";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { loadConfig } from "../../../server/src/config";
import { startOnPremServer } from "../../../server/src/onprem-server";

const MIME: Record<string, string> = {
    ".css": "text/css",
    ".html": "text/html",
    ".js": "text/javascript",
    ".json": "application/json",
    ".png": "image/png",
    ".svg": "image/svg+xml",
    ".wasm": "application/wasm",
};

export class OnPremProductionStack {
    readonly password = "correct horse battery staple";
    readonly dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "outliner-client-onprem-"));
    readonly backendPort: number;
    readonly originPort: number;
    private backend?: Awaited<ReturnType<typeof startOnPremServer>>;
    private gateway?: http.Server;

    constructor(workerIndex: number) {
        this.backendPort = 17400 + workerIndex * 2;
        this.originPort = this.backendPort + 1;
    }

    get origin() {
        return `http://127.0.0.1:${this.originPort}`;
    }

    async start() {
        process.env.OUTLINER_LOCAL_PASSWORD = this.password;
        this.backend = await startOnPremServer(loadConfig({
            OUTLINER_DEPLOYMENT_MODE: "onprem",
            OUTLINER_DATA_DIR: this.dataDir,
            OUTLINER_LOCAL_PASSWORD: this.password,
            PORT: String(this.backendPort),
            LOG_LEVEL: "silent",
        }));
        this.gateway = http.createServer((request, response) => this.handle(request, response));
        this.gateway.on("upgrade", (request, socket, head) => this.upgrade(request, socket, head));
        await new Promise<void>((resolve, reject) =>
            this.gateway!.listen(this.originPort, "127.0.0.1", resolve).once("error", reject)
        );
    }

    async restart() {
        await this.shutdownBackend();
        await this.startBackend();
    }

    async shutdownBackend() {
        await this.backend?.shutdown();
        this.backend = undefined;
    }

    async stop() {
        await this.backend?.shutdown();
        await new Promise<void>(resolve => this.gateway?.close(() => resolve()) ?? resolve());
        fs.rmSync(this.dataDir, { recursive: true, force: true });
    }

    private async startBackend() {
        process.env.OUTLINER_LOCAL_PASSWORD = this.password;
        this.backend = await startOnPremServer(loadConfig({
            OUTLINER_DEPLOYMENT_MODE: "onprem",
            OUTLINER_DATA_DIR: this.dataDir,
            PORT: String(this.backendPort),
            LOG_LEVEL: "silent",
        }));
    }

    private handle(request: http.IncomingMessage, response: http.ServerResponse) {
        if (request.url?.startsWith("/api/")) {
            const upstream = http.request({
                hostname: "127.0.0.1",
                port: this.backendPort,
                path: request.url,
                method: request.method,
                headers: { ...request.headers, host: `127.0.0.1:${this.backendPort}` },
            }, result => {
                response.writeHead(result.statusCode ?? 502, result.headers);
                result.pipe(response);
            });
            upstream.on("error", () => {
                response.writeHead(503);
                response.end("Backend unavailable");
            });
            request.pipe(upstream);
            return;
        }
        const build = path.resolve(import.meta.dirname, "../../../build");
        const pathname = decodeURIComponent(new URL(request.url ?? "/", this.origin).pathname);
        const candidate = path.join(build, pathname === "/" ? "index.html" : pathname);
        const file = fs.existsSync(candidate) && fs.statSync(candidate).isFile()
            ? candidate
            : path.join(build, "index.html");
        response.setHeader("Content-Type", MIME[path.extname(file)] ?? "application/octet-stream");
        fs.createReadStream(file).pipe(response);
    }

    private upgrade(request: http.IncomingMessage, socket: import("node:stream").Duplex, head: Buffer) {
        const upstream = net.connect(this.backendPort, "127.0.0.1", () => {
            upstream.write(`${request.method} ${request.url} HTTP/${request.httpVersion}\r\n`);
            for (const [name, value] of Object.entries(request.headers)) {
                if (value !== undefined) {
                    upstream.write(`${name}: ${Array.isArray(value) ? value.join(", ") : value}\r\n`);
                }
            }
            upstream.write("\r\n");
            if (head.length) upstream.write(head);
            socket.pipe(upstream).pipe(socket);
        });
        upstream.on("error", () => socket.destroy());
    }
}
