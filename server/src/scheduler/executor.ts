import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Worker } from "node:worker_threads";
import { serverLogger as logger } from "../utils/log-manager.js";

export class JobExecutor {
    private worker: Worker | null = null;
    private msgId = 0;
    private resolvers = new Map<number, { resolve: (val: any) => void; reject: (err: any) => void; }>();

    constructor() {}

    startWorker() {
        if (this.worker) return;
        try {
            const currentFile = fileURLToPath(import.meta.url);
            const isTs = currentFile.endsWith(".ts");
            const baseDir = dirname(currentFile);
            const workerFile = isTs
                ? resolve(baseDir.replace("/src/", "/dist/server/src/"), "worker.js")
                : resolve(baseDir, "worker.js");

            this.worker = new Worker(workerFile);
            this.worker.unref();
            this.worker.on("message", (msg) => {
                if (msg.id !== undefined && this.resolvers.has(msg.id)) {
                    const r = this.resolvers.get(msg.id)!;
                    this.resolvers.delete(msg.id);
                    r.resolve(msg.result);
                }
            });
            this.worker.on("error", (err) => {
                logger.error({ err }, "JobExecutor worker error");
                this.worker = null;
            });
            this.worker.on("exit", (code) => {
                this.worker = null;
            });
        } catch (err) {
            logger.error({ err }, "Failed to start JobExecutor worker");
        }
    }

    executeJob(jobData: any): Promise<any> {
        return new Promise((resolve, reject) => {
            if (!this.worker) {
                return reject(new Error("Worker not started"));
            }
            const id = this.msgId++;
            this.resolvers.set(id, { resolve, reject });
            this.worker.postMessage({ id, type: "execute", data: jobData });

            setTimeout(() => {
                if (this.resolvers.has(id)) {
                    const r = this.resolvers.get(id)!;
                    this.resolvers.delete(id);
                    this.stopWorker();
                    this.startWorker();
                    r.reject(new Error("Job timeout"));
                }
            }, 10000);
        });
    }

    async stopWorker(): Promise<void> {
        if (this.worker) {
            await this.worker.terminate();
            this.worker = null;
            for (const r of this.resolvers.values()) {
                r.reject(new Error("Worker terminated"));
            }
            this.resolvers.clear();
        }
    }
}
