import type { TestInfo } from "@playwright/test";
import { type ChildProcess, fork } from "node:child_process";
import { createWriteStream } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export interface CatalogSnapshot {
    project?: { catalog: any; tables: { id: string; sqlName: string; }[]; grids: unknown; calendars: unknown; };
    table?: { schema: string; records: Record<string, Record<string, unknown>>; };
}

export class CatalogBrowserServer {
    port = 0;
    private sequence = 0;
    private pending = new Map<
        number,
        { resolve: (value: any) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout>; }
    >();
    private constructor(private child: ChildProcess) {
        child.on("message", (message: any) => {
            if (message.ready) this.port = message.port;
            const pending = this.pending.get(message.id);
            if (!pending) return;
            this.pending.delete(message.id);
            clearTimeout(pending.timer);
            if (message.error) pending.reject(new Error(message.error));
            else pending.resolve(message.result);
        });
        child.on("exit", code => {
            for (const pending of this.pending.values()) {
                clearTimeout(pending.timer);
                pending.reject(new Error(`Catalog fixture exited: ${code}`));
            }
            this.pending.clear();
        });
    }
    static async start(info: TestInfo) {
        const repository = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
        const child = fork(resolve(repository, "server/tests/catalog-browser-worker.ts"), [], {
            cwd: resolve(repository, "server"),
            // Use the established server loader pair so shared sources and the
            // server share one Yjs instance without changing the client symlink.
            execArgv: ["--loader", "ts-node/esm", "--loader", "./tests/loaders/pin-server-deps.mjs", "--no-warnings"],
            env: {
                ...process.env,
                NODE_ENV: "test",
                TS_NODE_TRANSPILE_ONLY: "1",
                ALLOW_TEST_ACCESS: "false",
                DISABLE_JOB_SCHEDULER: "true",
                DISABLE_PERSISTENCE: "false",
                // Disable development seeding/clearing during Firebase initialization.
                MCP_DIAGNOSTIC_INVOKER: "true",
                MCP_LOCAL_DIAGNOSTICS: "false",
                MCP_FIREBASE_MODE: "emulator",
                FIREBASE_AUTH_EMULATOR_HOST: process.env.FIREBASE_AUTH_EMULATOR_HOST || "127.0.0.1:59099",
                FIRESTORE_EMULATOR_HOST: process.env.FIRESTORE_EMULATOR_HOST || "127.0.0.1:58080",
                FIREBASE_PROJECT_ID: "outliner-d57b0",
                GCLOUD_PROJECT: "outliner-d57b0",
                FIREBASE_PRIVATE_KEY: "",
                FIREBASE_ADMIN_SDK_PATH: "",
            },
            stdio: ["ignore", "pipe", "pipe", "ipc"],
        });
        const logPath = info.outputPath("catalog-service.log");
        const log = createWriteStream(logPath);
        child.stdout?.pipe(log, { end: false });
        child.stderr?.pipe(log, { end: false });
        child.on("exit", () => log.end());
        const server = new CatalogBrowserServer(child);
        await new Promise<void>((done, reject) => {
            const timer = setTimeout(
                () => reject(new Error(`Catalog fixture startup timed out; see ${logPath}`)),
                90_000,
            );
            child.on("message", (message: any) => {
                if (message.ready) {
                    clearTimeout(timer);
                    done();
                }
            });
            child.once("exit", code => {
                clearTimeout(timer);
                reject(new Error(`Catalog fixture startup failed (${code}); see ${logPath}`));
            });
        });
        return server;
    }
    request<T = any>(command: string, input: Record<string, unknown>): Promise<T> {
        const id = ++this.sequence;
        return new Promise((done, reject) => {
            const timer = setTimeout(() => {
                this.pending.delete(id);
                reject(new Error(`Catalog fixture ${command} timed out`));
            }, 90_000);
            this.pending.set(id, { resolve: done, reject, timer });
            this.child.send({ id, command, input });
        });
    }
    async close() {
        if (this.child.exitCode !== null) return;
        await new Promise<void>(done => {
            const timer = setTimeout(() => this.child.kill("SIGTERM"), 10_000);
            this.child.once("exit", () => {
                clearTimeout(timer);
                done();
            });
            this.child.disconnect();
        });
    }
}
