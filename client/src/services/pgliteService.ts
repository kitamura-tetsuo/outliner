import { PGlite } from "@electric-sql/pglite";
import { getLogger } from "../lib/logger";

const logger = getLogger("pgliteService");

export interface ColumnMeta {
    name: string;
    type?: string;
}

export interface QueryResult {
    rows: Record<string, unknown>[];
    columnsMeta: ColumnMeta[];
}

export interface PGliteError {
    recordId?: string;
    column?: string;
    message: string;
    code?: string;
}

let pgInstancePromise: Promise<PGlite> | null = null;

// Lazily initialize PGlite instance
export function getPGlite(): Promise<PGlite> {
    if (!pgInstancePromise) {
        pgInstancePromise = (async () => {
            logger.info("Initializing PGlite instance (memory://)");
            const pg = new PGlite("memory://");
            await pg.waitReady;
            return pg;
        })();
    }
    return pgInstancePromise;
}

// Queue for serializing write operations
type WriteOperation = () => Promise<void>;
const writeQueue: WriteOperation[] = [];
let isProcessingQueue = false;

async function processWriteQueue() {
    if (isProcessingQueue || writeQueue.length === 0) return;
    isProcessingQueue = true;

    try {
        while (writeQueue.length > 0) {
            const op = writeQueue.shift();
            if (op) {
                await op();
            }
        }
    } catch (err) {
        logger.error(err instanceof Error ? err : new Error(String(err)), "Error processing write queue");
    } finally {
        isProcessingQueue = false;
    }
}

export function queueWriteOperation(op: WriteOperation): void {
    writeQueue.push(op);
    processWriteQueue();
}

// Helper to execute query safely within the queue
export function executeWrite(query: string, params: unknown[] = []): Promise<void> {
    return new Promise((resolve, reject) => {
        queueWriteOperation(async () => {
            try {
                const pg = await getPGlite();
                await pg.query(query, params);
                resolve();
            } catch (error) {
                reject(error);
            }
        });
    });
}

// Query Execution with debouncing
const debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();

export function executeQueryDebounced(
    key: string,
    query: string,
    params: unknown[] = [],
    callback: (result: QueryResult | null, error?: PGliteError) => void,
    delayMs = 200,
): void {
    if (debounceTimers.has(key)) {
        clearTimeout(debounceTimers.get(key));
    }

    const timer = setTimeout(async () => {
        debounceTimers.delete(key);
        try {
            const pg = await getPGlite();
            const res = await pg.query(query, params);

            const columnsMeta: ColumnMeta[] = res.fields.map(f => ({
                name: f.name,
                type: String(f.dataTypeID), // Can map to actual types if needed
            }));

            callback({
                rows: res.rows as Record<string, unknown>[],
                columnsMeta,
            });
        } catch (err) {
            logger.error({ query, err }, "Query error");
            const e = err as { message?: string; code?: string; };
            callback(null, {
                message: e.message || String(err),
                code: e.code,
            });
        }
    }, delayMs);

    debounceTimers.set(key, timer);
}

// Direct read query (no debouncing, no queue)
export async function executeQuery(query: string, params: unknown[] = []): Promise<QueryResult> {
    const pg = await getPGlite();
    const res = await pg.query(query, params);

    const columnsMeta: ColumnMeta[] = res.fields.map(f => ({
        name: f.name,
        type: String(f.dataTypeID),
    }));

    return {
        rows: res.rows as Record<string, unknown>[],
        columnsMeta,
    };
}
