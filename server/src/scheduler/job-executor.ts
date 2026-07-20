import { Worker } from "worker_threads";
import path from "path";
import { fileURLToPath } from "url";
import { serverLogger as logger } from "../utils/log-manager.js";
import fs from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface JobMessage {
    type: "EXECUTE_JOB";
    ruleId: string;
    schemaSql: string;
    records: Record<string, any>[];
    ruleSql: string;
    timezone: string;
    occurrenceIso: string;
}

let worker: Worker | null = null;
let currentJobPromise: { resolve: (val: any) => void, reject: (err: any) => void } | null = null;
let jobTimeoutTimer: NodeJS.Timeout | null = null;

function getWorker() {
    if (!worker) {
        // Find if we are in dist or src
        const workerPathTs = path.join(__dirname, "job-executor-worker.ts");
        const workerPathJs = path.join(__dirname, "job-executor-worker.js");
        const isTs = fs.existsSync(workerPathTs);
        const p = isTs ? workerPathTs : workerPathJs;

        const workerOpts = isTs ? { execArgv: ["--loader", "ts-node/esm"] } : {};

        worker = new Worker(p, workerOpts);

        worker.on("message", (msg) => {
            if (msg.type === "JOB_RESULT") {
                if (currentJobPromise) {
                    if (jobTimeoutTimer) {
                        clearTimeout(jobTimeoutTimer);
                        jobTimeoutTimer = null;
                    }
                    currentJobPromise.resolve(msg);
                    currentJobPromise = null;
                }
            }
        });

        worker.on("error", (err) => {
            if (currentJobPromise) {
                if (jobTimeoutTimer) {
                    clearTimeout(jobTimeoutTimer);
                    jobTimeoutTimer = null;
                }
                currentJobPromise.reject(err);
                currentJobPromise = null;
            }
            worker = null;
        });

        worker.on("exit", () => {
            worker = null;
        });
    }
    return worker;
}

export async function executeJob(job: Omit<JobMessage, "type">, timeoutMs: number = 10000): Promise<{ success: boolean, error?: string, rows?: any[] }> {
    return new Promise((resolve, reject) => {
        const w = getWorker();
        currentJobPromise = { resolve, reject };

        jobTimeoutTimer = setTimeout(() => {
            if (currentJobPromise) {
                // Timeout, terminate worker
                logger.warn({ ruleId: job.ruleId }, "Job execution timed out, terminating worker");
                w.terminate();
                worker = null;
                currentJobPromise.resolve({ success: false, error: "Job timed out" });
                currentJobPromise = null;
            }
        }, timeoutMs);

        w.postMessage({ type: "EXECUTE_JOB", ...job });
    });
}
