import fs from "node:fs";
import http from "node:http";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import type { Duplex, Readable } from "node:stream";
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
interface Exchange {
    downstreamResponse: http.ServerResponse;
    upstreamRequest: http.ClientRequest;
    upstreamResponse?: http.IncomingMessage;
    terminal: boolean;
}
interface Tunnel {
    client: Duplex;
    upstream: net.Socket;
}

export class OnPremProductionStack {
    readonly password = "correct horse battery staple";
    readonly dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "outliner-client-onprem-"));
    readonly backendPort: number;
    readonly originPort: number;
    private backend?: Awaited<ReturnType<typeof startOnPremServer>>;
    private gateway?: http.Server;
    private sessionBodyGate?: Promise<void>;
    private sessionBodyReached?: Promise<void>;
    private markSessionBodyReached?: () => void;
    private readonly exchanges = new Set<Exchange>();
    private readonly tunnels = new Set<Tunnel>();
    private stopping = false;

    delayNextSessionBody(): () => void {
        let release!: () => void;
        this.sessionBodyGate = new Promise<void>(resolve => release = resolve);
        this.sessionBodyReached = new Promise<void>(resolve => this.markSessionBodyReached = resolve);
        return release;
    }

    async waitForDelayedSessionBody() {
        if (!this.sessionBodyReached) throw new Error("No delayed session body is configured");
        await this.sessionBodyReached;
    }
    constructor(workerIndex: number) {
        this.backendPort = 17400 + workerIndex * 2;
        this.originPort = this.backendPort + 1;
    }
    get origin() {
        return `http://127.0.0.1:${this.originPort}`;
    }

    async start() {
        this.stopping = false;
        await this.startBackend();
        this.gateway = http.createServer((request, response) => this.handle(request, response));
        // A reset can precede HTTP parsing. It nevertheless belongs to this gateway.
        this.gateway.on("connection", socket => socket.on("error", () => socket.destroy()));
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
        // server.close() otherwise waits for deliberately gated response bodies.
        this.cancelBackendWork();
        await this.backend?.shutdown();
        this.backend = undefined;
    }
    makeDirectoryUnavailable() {
        this.backend?.directory.close();
    }
    async stop() {
        this.stopping = true;
        await this.shutdownBackend();
        const gateway = this.gateway;
        this.gateway = undefined;
        if (gateway) {
            gateway.closeAllConnections();
            await new Promise<void>((resolve, reject) => gateway.close(error => error ? reject(error) : resolve()));
            gateway.removeAllListeners();
        }
        this.sessionBodyGate = undefined;
        fs.rmSync(this.dataDir, { recursive: true, force: true });
    }
    private async startBackend() {
        process.env.OUTLINER_LOCAL_PASSWORD = this.password;
        this.backend = await startOnPremServer(
            loadConfig({
                OUTLINER_DEPLOYMENT_MODE: "onprem",
                OUTLINER_DATA_DIR: this.dataDir,
                OUTLINER_LOCAL_PASSWORD: this.password,
                PORT: String(this.backendPort),
                LOG_LEVEL: "silent",
            }),
        );
    }
    private cancelBackendWork() {
        this.sessionBodyGate = undefined;
        for (const exchange of [...this.exchanges]) this.cancelExchange(exchange);
        for (const tunnel of [...this.tunnels]) this.closeTunnel(tunnel);
    }
    private cancelExchange(exchange: Exchange) {
        if (exchange.terminal) return;
        exchange.terminal = true;
        this.exchanges.delete(exchange);
        exchange.upstreamResponse?.destroy();
        exchange.upstreamRequest.destroy();
        if (!exchange.downstreamResponse.destroyed) exchange.downstreamResponse.destroy();
    }
    private completeExchange(exchange: Exchange) {
        if (exchange.terminal) return;
        exchange.terminal = true;
        this.exchanges.delete(exchange);
    }

    private handle(request: http.IncomingMessage, response: http.ServerResponse) {
        if (request.url?.startsWith("/api/")) {
            const upstream = http.request({
                hostname: "127.0.0.1",
                port: this.backendPort,
                path: request.url,
                method: request.method,
                headers: { ...request.headers, host: `127.0.0.1:${this.backendPort}` },
            });
            const exchange: Exchange = { downstreamResponse: response, upstreamRequest: upstream, terminal: false };
            this.exchanges.add(exchange);
            const canceledByClient = () => {
                if (!response.writableFinished) this.cancelExchange(exchange);
            };
            request.once("aborted", canceledByClient);
            response.once("close", canceledByClient);
            response.once("finish", () => this.completeExchange(exchange));
            request.once("error", () => this.cancelExchange(exchange));
            response.once("error", () => this.cancelExchange(exchange));
            upstream.once("response", result => {
                if (exchange.terminal) {
                    result.destroy();
                    return;
                }
                exchange.upstreamResponse = result;
                const failedBody = () => {
                    if (!exchange.terminal) response.destroy();
                    this.cancelExchange(exchange);
                };
                result.once("error", failedBody);
                result.once("aborted", failedBody);
                response.writeHead(result.statusCode ?? 502, result.headers);
                if (request.method === "GET" && request.url === "/api/local-auth/session" && this.sessionBodyGate) {
                    const gate = this.sessionBodyGate;
                    this.sessionBodyGate = undefined;
                    this.markSessionBodyReached?.();
                    this.markSessionBodyReached = undefined;
                    void gate.then(() => {
                        if (!exchange.terminal && !response.destroyed) result.pipe(response);
                        else result.destroy();
                    });
                } else result.pipe(response);
            });
            upstream.once("error", () => {
                if (exchange.terminal) return;
                if (!response.headersSent) {
                    response.writeHead(503);
                    response.end("Backend unavailable");
                } else response.destroy();
            });
            request.pipe(upstream);
            return;
        }
        if (new URL(request.url ?? "/", this.origin).pathname.endsWith("/libpg-query.wasm")) {
            response.setHeader("Content-Type", "application/wasm");
            this.pipeFile(
                fs.createReadStream(
                    path.resolve(import.meta.dirname, "../../../shared/node_modules/libpg-query/wasm/libpg-query.wasm"),
                ),
                response,
            );
            return;
        }
        const build = path.resolve(import.meta.dirname, "../../../build");
        const pathname = decodeURIComponent(new URL(request.url ?? "/", this.origin).pathname);
        const candidate = path.join(build, pathname === "/" ? "index.html" : pathname);
        const file = fs.existsSync(candidate) && fs.statSync(candidate).isFile()
            ? candidate
            : path.join(build, "index.html");
        response.setHeader("Content-Type", MIME[path.extname(file)] ?? "application/octet-stream");
        this.pipeFile(fs.createReadStream(file), response);
    }
    private pipeFile(source: Readable, response: http.ServerResponse) {
        source.once("error", () => response.destroy());
        response.once("error", () => source.destroy());
        response.once("close", () => source.destroy());
        source.pipe(response);
    }
    private upgrade(request: http.IncomingMessage, socket: Duplex, head: Buffer) {
        const upstream = net.connect(this.backendPort, "127.0.0.1");
        const tunnel: Tunnel = { client: socket, upstream };
        this.tunnels.add(tunnel);
        const close = () => this.closeTunnel(tunnel);
        socket.once("error", close);
        socket.once("close", close);
        upstream.once("error", close);
        upstream.once("close", close);
        upstream.once("connect", () => {
            if (!this.tunnels.has(tunnel) || this.stopping) return close();
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
    }
    private closeTunnel(tunnel: Tunnel) {
        if (!this.tunnels.delete(tunnel)) return;
        tunnel.client.unpipe(tunnel.upstream);
        tunnel.upstream.unpipe(tunnel.client);
        tunnel.client.destroy();
        tunnel.upstream.destroy();
    }
}
