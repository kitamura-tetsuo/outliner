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
export interface TransportEvent {
    id: number;
    kind:
        | "http-start"
        | "http-headers"
        | "http-client-abort"
        | "http-lifecycle-cancel"
        | "http-upstream-error"
        | "ws-open"
        | "ws-client-close"
        | "ws-upstream-close";
    url: string;
}
interface Exchange {
    id: number;
    url: string;
    downstreamResponse: http.ServerResponse;
    upstreamRequest: http.ClientRequest;
    upstreamResponse?: http.IncomingMessage;
    terminal: boolean;
}
interface Tunnel {
    id: number;
    url: string;
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
    private nextTransportId = 1;
    private readonly transportEvents: TransportEvent[] = [];
    private readonly transportWaiters = new Set<(event: TransportEvent) => void>();

    transportSnapshot() {
        return [...this.transportEvents];
    }

    clearTransportEvents() {
        this.transportEvents.length = 0;
    }

    waitForTransportEvent(kind: TransportEvent["kind"], url: string): Promise<TransportEvent> {
        const existing = this.transportEvents.find(event => event.kind === kind && event.url.includes(url));
        if (existing) return Promise.resolve(existing);
        return new Promise(resolve => {
            const waiter = (event: TransportEvent) => {
                if (event.kind !== kind || !event.url.includes(url)) return;
                this.transportWaiters.delete(waiter);
                resolve(event);
            };
            this.transportWaiters.add(waiter);
        });
    }

    isTunnelOpen(id: number) {
        return [...this.tunnels].some(tunnel => tunnel.id === id);
    }

    interruptUpstreamResponse(id: number) {
        const exchange = [...this.exchanges].find(candidate => candidate.id === id);
        if (!exchange?.upstreamResponse) throw new Error(`No active upstream response for exchange ${id}`);
        exchange.upstreamResponse.destroy(new Error("controlled upstream transport interruption"));
    }

    private recordTransport(event: TransportEvent) {
        this.transportEvents.push(event);
        for (const waiter of [...this.transportWaiters]) waiter(event);
    }

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
        for (const exchange of [...this.exchanges]) this.cancelExchange(exchange, "http-lifecycle-cancel");
        for (const tunnel of [...this.tunnels]) this.closeTunnel(tunnel);
    }
    private cancelExchange(exchange: Exchange, cancellation?: "http-client-abort" | "http-lifecycle-cancel") {
        if (exchange.terminal) return;
        exchange.terminal = true;
        this.exchanges.delete(exchange);
        if (cancellation) this.recordTransport({ id: exchange.id, kind: cancellation, url: exchange.url });
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
            const exchange: Exchange = {
                id: this.nextTransportId++,
                url: request.url,
                downstreamResponse: response,
                upstreamRequest: upstream,
                terminal: false,
            };
            this.exchanges.add(exchange);
            this.recordTransport({ id: exchange.id, kind: "http-start", url: exchange.url });
            const canceledByClient = () => {
                if (!response.writableFinished) this.cancelExchange(exchange, "http-client-abort");
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
                this.recordTransport({ id: exchange.id, kind: "http-headers", url: exchange.url });
                const failedBody = () => {
                    if (!exchange.terminal) {
                        this.recordTransport({ id: exchange.id, kind: "http-upstream-error", url: exchange.url });
                    }
                    if (!exchange.terminal) response.destroy();
                    this.cancelExchange(exchange);
                };
                result.once("error", failedBody);
                result.once("aborted", failedBody);
                response.writeHead(result.statusCode ?? 502, result.headers);
                if (request.method === "GET" && request.url === "/api/local-auth/session" && this.sessionBodyGate) {
                    // Make the delayed transfer a real post-header transport boundary.
                    response.flushHeaders();
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
                this.recordTransport({ id: exchange.id, kind: "http-upstream-error", url: exchange.url });
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
        const tunnel: Tunnel = { id: this.nextTransportId++, url: request.url ?? "/", client: socket, upstream };
        this.tunnels.add(tunnel);
        const clientClose = () => this.closeTunnel(tunnel, "ws-client-close");
        const upstreamClose = () => this.closeTunnel(tunnel, "ws-upstream-close");
        socket.once("error", clientClose);
        socket.once("close", clientClose);
        upstream.once("error", upstreamClose);
        upstream.once("close", upstreamClose);
        upstream.once("connect", () => {
            if (!this.tunnels.has(tunnel) || this.stopping) return this.closeTunnel(tunnel);
            upstream.write(`${request.method} ${request.url} HTTP/${request.httpVersion}\r\n`);
            for (const [name, value] of Object.entries(request.headers)) {
                if (value !== undefined) {
                    upstream.write(`${name}: ${Array.isArray(value) ? value.join(", ") : value}\r\n`);
                }
            }
            upstream.write("\r\n");
            if (head.length) upstream.write(head);
            socket.pipe(upstream).pipe(socket);
            this.recordTransport({ id: tunnel.id, kind: "ws-open", url: tunnel.url });
        });
    }
    private closeTunnel(tunnel: Tunnel, kind?: "ws-client-close" | "ws-upstream-close") {
        if (!this.tunnels.delete(tunnel)) return;
        if (kind) this.recordTransport({ id: tunnel.id, kind, url: tunnel.url });
        tunnel.client.unpipe(tunnel.upstream);
        tunnel.upstream.unpipe(tunnel.client);
        tunnel.client.destroy();
        tunnel.upstream.destroy();
    }
}
