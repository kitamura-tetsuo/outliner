import type { Logger } from "pino";
import type { LeveldbPersistence } from "y-leveldb";
import { warnIfRoomTooLarge } from "./persistence";

interface ListenerInfo {
    warn: () => void;
    count: number;
}

const listeners = new Map<string, ListenerInfo>();

export async function addRoomSizeListener(
    persistence: LeveldbPersistence,
    docName: string,
    limitBytes: number,
    logger: Logger,
): Promise<void> {
    let info = listeners.get(docName);
    if (!info) {
        const doc = await persistence.getYDoc(docName);
        const warn = () => warnIfRoomTooLarge(persistence, docName, limitBytes, logger);
        doc.on("update", warn);
        info = { warn, count: 0 };
        listeners.set(docName, info);
    }
    info.count++;
}

export async function removeRoomSizeListener(
    persistence: LeveldbPersistence,
    docName: string,
): Promise<void> {
    const info = listeners.get(docName);
    if (!info) return;
    info.count--;
    if (info.count <= 0) {
        const doc = await persistence.getYDoc(docName);
        doc.off("update", info.warn);
        listeners.delete(docName);
    }
}
