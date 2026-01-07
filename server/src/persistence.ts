import type { Logger } from "pino";
import { LeveldbPersistence } from "y-leveldb";
import * as Y from "yjs";

export async function createPersistence(path: string): Promise<LeveldbPersistence> {
    const persistence = new LeveldbPersistence(path);
    // Wait for the underlying database to open
    // The tr property is a promise that resolves when the database transaction system is ready
    await persistence.tr;
    return persistence;
}

export async function warnIfRoomTooLarge(
    persistence: LeveldbPersistence,
    room: string,
    limitBytes: number,
    logger: Logger,
): Promise<void> {
    const doc = await persistence.getYDoc(room);
    const size = Y.encodeStateAsUpdate(doc).byteLength;
    if (size > limitBytes) {
        logger.warn({ event: "room_size_exceeded", room, bytes: size });
    }
}

export async function logTotalSize(
    persistence: LeveldbPersistence,
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
