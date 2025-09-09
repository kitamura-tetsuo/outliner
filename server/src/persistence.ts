import type { Logger } from "pino";
import { LeveldbPersistence } from "y-leveldb";
import * as Y from "yjs";

export function createPersistence(path: string) {
    return new LeveldbPersistence(path);
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
