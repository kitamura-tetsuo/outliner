import { HocuspocusProvider } from "@hocuspocus/provider";
import { type ChildProcess, spawn } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import WebSocket from "ws";
import * as Y from "yjs";

export async function unusedPort(): Promise<number> {
    return await new Promise((resolve, reject) => {
        const probe = net.createServer();
        probe.once("error", reject);
        probe.listen(0, "127.0.0.1", () => {
            const address = probe.address();
            if (!address || typeof address === "string") return reject(new Error("No test port"));
            probe.close(error => error ? reject(error) : resolve(address.port));
        });
    });
}

export class ProductionOnPrem {
    child: ChildProcess | undefined;
    diagnostics = "";
    readonly providers: HocuspocusProvider[] = [];
    port = 0;

    constructor(
        readonly dataDir: string,
        private readonly options: {
            port?: number;
            startupTimeout?: number;
            entrypointArgs?: string[];
        } = {},
    ) {}

    async start(): Promise<void> {
        if (this.child && this.child.exitCode === null && this.child.signalCode === null) {
            throw new Error("Production server is already running");
        }
        this.diagnostics = "";
        this.port = this.options.port ?? 0;
        this.child = spawn(process.execPath, [
            ...(this.options.entrypointArgs ?? [
                "--loader",
                "ts-node/esm",
                "--loader",
                "./tests/loaders/pin-server-deps.mjs",
                "--no-warnings",
                "src/index.ts",
            ]),
        ], {
            cwd: path.resolve(import.meta.dirname, ".."),
            env: {
                PATH: process.env.PATH,
                NODE_ENV: "production",
                PORT: String(this.port),
                OUTLINER_DEPLOYMENT_MODE: "onprem",
                OUTLINER_DATA_DIR: this.dataDir,
                OUTLINER_LOCAL_PASSWORD: "production-password",
            },
            stdio: ["ignore", "pipe", "pipe", "ipc"],
        });
        const child = this.child;
        child.stdout?.on("data", chunk => this.diagnostics += chunk.toString());
        child.stderr?.on("data", chunk => this.diagnostics += chunk.toString());
        let announcedPort: number | undefined;
        child.on("message", message => {
            if (
                typeof message === "object" && message !== null
                && (message as { type?: unknown; }).type === "outliner-listening"
                && Number.isInteger((message as { port?: unknown; }).port)
                && Number((message as { port: number; }).port) >= 1
                && Number((message as { port: number; }).port) <= 65535
            ) announcedPort = Number((message as { port: number; }).port);
        });
        const deadline = Date.now() + (this.options.startupTimeout ?? 15000);
        while (Date.now() < deadline && child.exitCode === null && child.signalCode === null) {
            if (!announcedPort) {
                await new Promise(resolve => setTimeout(resolve, 25));
                continue;
            }
            this.port = announcedPort;
            try {
                const response = await fetch(this.url("/health"));
                if (response.ok && child.exitCode === null && child.signalCode === null) return;
            } catch {
                // The production listener is not ready yet.
            }
            await new Promise(resolve => setTimeout(resolve, 50));
        }
        const outcome = child.exitCode === null && child.signalCode === null
            ? "readiness timed out"
            : `child exited with code ${child.exitCode}, signal ${child.signalCode ?? "none"}`;
        await this.stop();
        throw new Error(
            `Production server did not become ready (${outcome}; pid ${child.pid ?? "unknown"}; `
                + `requested port ${this.options.port ?? "ephemeral"}; announced port ${announcedPort ?? "none"}): `
                + this.diagnostics,
        );
    }

    url(route: string): string {
        return `http://127.0.0.1:${this.port}${route}`;
    }

    async login(): Promise<string> {
        const response = await fetch(this.url("/api/local-auth/login"), {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ password: "production-password" }),
        });
        if (!response.ok) throw new Error(`Login failed: ${response.status}`);
        return response.headers.getSetCookie()[0]!.split(";")[0]!;
    }

    async createProject(cookie: string, projectId = "project_one"): Promise<void> {
        const response = await fetch(this.url("/api/projects"), {
            method: "POST",
            headers: { cookie, "content-type": "application/json" },
            body: JSON.stringify({ projectId, title: "Project One" }),
        });
        if (!response.ok) throw new Error(`Project creation failed: ${response.status}`);
    }

    connect(room: string, cookie: string): { provider: HocuspocusProvider; doc: Y.Doc; } {
        class CookieWebSocket extends WebSocket {
            constructor(address: string | URL, protocols?: string | string[]) {
                super(address, protocols, { headers: { cookie } });
            }
        }
        const doc = new Y.Doc();
        const provider = new HocuspocusProvider({
            url: `ws://127.0.0.1:${this.port}/${room}`,
            name: room,
            document: doc,
            token: "protocol-token-is-not-authentication",
            WebSocketPolyfill: CookieWebSocket,
        });
        provider.on("authenticationFailed", ({ reason }: { reason?: string; }) => {
            this.diagnostics += `\nauthenticationFailed(${room}): ${reason ?? "unknown"}`;
        });
        provider.on("status", ({ status }: { status?: string; }) => {
            this.diagnostics += `\nstatus(${room}): ${status ?? "unknown"}`;
        });
        this.providers.push(provider);
        return { provider, doc };
    }

    async stop(signal: NodeJS.Signals = "SIGTERM", destroyProviders = true): Promise<number | null> {
        if (destroyProviders) this.destroyProviders();
        if (!this.child || this.child.exitCode !== null || this.child.signalCode !== null) {
            return this.child?.exitCode ?? null;
        }
        const child = this.child;
        const exited = new Promise<number | null>(resolve => child.once("exit", resolve));
        child.kill(signal);
        return await exited;
    }

    destroyProviders(): void {
        for (const provider of this.providers.splice(0)) provider.destroy();
    }
}

export function waitFor(provider: HocuspocusProvider, event: string, timeout = 8000): Promise<void> {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`Timed out waiting for ${event}`)), timeout);
        if (event !== "authenticationFailed") {
            provider.on("authenticationFailed", ({ reason }: { reason?: string; }) => {
                clearTimeout(timer);
                reject(new Error(`Authentication failed while waiting for ${event}: ${reason ?? "unknown"}`));
            });
        }
        provider.on(event, () => {
            clearTimeout(timer);
            resolve();
        });
    });
}

export function corrupt(file: string): void {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, "not a sqlite database");
}
