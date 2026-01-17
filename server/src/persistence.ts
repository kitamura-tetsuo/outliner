import type { Logger } from "pino";
import { LeveldbPersistence } from "y-leveldb";
import * as Y from "yjs";

export async function createPersistence(path: string): Promise<any> {
    if (process.env.DISABLE_Y_LEVELDB === "true") {
        return undefined;
    }
    const persistence = new LeveldbPersistence(path);
    // Wait for the underlying database to open
    // The tr property is a promise that resolves when the database transaction system is ready
    await persistence.tr;
    return persistence;
}

export async function logTotalSize(
    persistence: any,
    logger: Logger,
): Promise<void> {
    const names = await persistence.getAllDocNames();
    let total = 0;
    for (const n of names) {
        const d = await persistence.getYDoc(n);
        total += Y.encodeStateAsUpdate(d).byteLength;
    }
    logger.info({ event: "leveldb_total_size", bytes: total });
}
