import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Worker } from "node:worker_threads";
import { serverLogger as logger } from "../utils/log-manager.js";

import { JobData, JobResult } from "./worker-types.js";

export class JobExecutor {
    private worker: Worker | null = null;
    /**
     * The worker currently in use, or the one being spawned.
     *
     * Spawning is asynchronous because a new worker must never be constructed
     * while the previous one is still tearing down: the worker holds Postgres
     * as a WASM module, and overlapping the teardown of one WASM heap with the
     * instantiation of the next trips V8's thread-isolation bookkeeping
     * ("Check failed: jit_page_->allocations_.erase(addr) == 1" in
     * UnregisterWasmAllocation), which aborts the whole process with exit code
     * 133. Every restart path therefore chains onto `teardown`.
     */
    private workerReady: Promise<Worker> | null = null;
    private teardown: Promise<void> = Promise.resolve();
    private msgId = 0;
    private resolvers = new Map<number, { resolve: (val: JobResult) => void; reject: (err: unknown) => void; }>();

    constructor() {}

    startWorker() {
        if (this.workerReady) return;
        const ready = this.teardown.then(() => this.spawn());
        this.workerReady = ready;
        ready.catch((err) => {
            logger.error({ err }, "Failed to start JobExecutor worker");
            if (this.workerReady === ready) this.workerReady = null;
        });
    }

    private spawn(): Worker {
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
            // The worker is dead, but if it is still the current one, clean up
            // and restart once its termination has fully settled.
            if (this.worker !== worker) return;
            this.worker = null;
            this.workerReady = null;
            this.rejectPending(new Error("Worker error"));
            this.teardown = this.teardown
                .then(() => worker.terminate())
                .then(() => {}, (err) => logger.warn({ err }, "Failed to terminate worker"));
            this.startWorker();
        });
        worker.on("exit", (code) => {
            if (this.worker !== worker) return;
            this.worker = null;
            this.workerReady = null;
            this.rejectPending(new Error(`Worker exited with code ${code}`));
            this.startWorker();
        });
        return worker;
    }

    private rejectPending(err: Error) {
        for (const r of this.resolvers.values()) {
            r.reject(err);
        }
        this.resolvers.clear();
    }

    async executeJob(jobData: JobData): Promise<JobResult> {
        const ready = this.workerReady;
        if (!ready) {
            throw new Error("Worker not started");
        }
        const worker = await ready;
        // stopWorker() may have run while this job was awaiting the spawn: its
        // pass over `resolvers` happened before this job could register one, so
        // posting now would strand the job until its timeout (and the exit
        // handler deliberately stays quiet for a worker it no longer owns).
        if (this.workerReady !== ready) {
            throw new Error("Worker terminated");
        }

        return new Promise<JobResult>((resolve, reject) => {
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
            }, 20000); // 20s timeout

            this.resolvers.set(id, {
                resolve: (val) => {
                    clearTimeout(timer);
                    resolve(val);
                },
                reject: (err) => {
                    clearTimeout(timer);
                    reject(err);
                },
            });

            worker.postMessage({ id, type: "execute", data: jobData });
        });
    }

    async stopWorker(): Promise<void> {
        const ready = this.workerReady;
        // Null out the pending worker immediately so startWorker() can queue a
        // new one behind this teardown.
        this.workerReady = null;

        // Clear outstanding jobs before terminating so they reject with "Worker terminated"
        // rather than generic "Worker exited" from the exit handler.
        this.rejectPending(new Error("Worker terminated"));

        if (!ready) {
            await this.teardown;
            return;
        }

        const done = (async () => {
            let worker: Worker;
            try {
                worker = await ready;
            } catch {
                // The spawn already failed and was logged; nothing to tear down.
                return;
            }
            // Cleared before terminate() so the exit handler does not treat
            // this as a crash and restart the worker.
            if (this.worker === worker) this.worker = null;
            await worker.terminate();
        })();
        this.teardown = done.then(() => {}, () => {});
        await done;
    }
}
