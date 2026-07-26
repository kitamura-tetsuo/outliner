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

            const worker = new Worker(workerFile);
            this.worker = worker;
            worker.unref();
            worker.on("message", (msg) => {
                if (msg.id !== undefined && this.resolvers.has(msg.id)) {
                    const r = this.resolvers.get(msg.id)!;
                    this.resolvers.delete(msg.id);
                    r.resolve(msg.result);
                }
            });
            worker.on("error", (err) => {
                logger.error({ err }, "JobExecutor worker error");
                // The worker is dead, but if it is still the current one, clean up and restart.
                if (this.worker === worker) {
                    worker.terminate().catch(() => {});
                    this.worker = null;
                    for (const r of this.resolvers.values()) {
                        r.reject(new Error("Worker error"));
                    }
                    this.resolvers.clear();
                    this.startWorker();
                }
            });
            worker.on("exit", (code) => {
                if (this.worker === worker) {
                    this.worker = null;
                    for (const r of this.resolvers.values()) {
                        r.reject(new Error(`Worker exited with code ${code}`));
                    }
                    this.resolvers.clear();
                    this.startWorker();
                }
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

            const timer = setTimeout(() => {
                if (this.resolvers.has(id)) {
                    const r = this.resolvers.get(id)!;
                    this.resolvers.delete(id);
                    this.stopWorker().catch((err) => {
                        logger.error({ err }, "Error stopping worker on timeout");
                    });
                    this.startWorker();
                    r.reject(new Error("Job timeout"));
                }
            }, 10000);

            this.resolvers.set(id, {
                resolve: (val) => {
                    clearTimeout(timer);
                    resolve(val);
                },
                reject: (err) => {
                    clearTimeout(timer);
                    reject(err);
                }
            });

            this.worker.postMessage({ id, type: "execute", data: jobData });
        });
    }

    async stopWorker(): Promise<void> {
        const workerToTerminate = this.worker;
        if (workerToTerminate) {
            // Null out the worker immediately so startWorker() can create a new one synchronously
            this.worker = null;

            // Clear outstanding jobs before terminating so they reject with "Worker terminated"
            // rather than generic "Worker exited" from the exit handler.
            for (const r of this.resolvers.values()) {
                r.reject(new Error("Worker terminated"));
            }
            this.resolvers.clear();

            await workerToTerminate.terminate();
        }
    }
}
