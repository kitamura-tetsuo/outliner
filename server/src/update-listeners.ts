import type { Logger } from "pino";
import type { LeveldbPersistence } from "y-leveldb";
import { warnIfRoomTooLarge } from "./persistence.js";

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
        // Prefer minimal-granularity observeDeep on the root orderedTree map when available
        try {
            const ymap: any = (doc as any)?.getMap?.("orderedTree");
            if (ymap && typeof ymap.observeDeep === "function") {
                ymap.observeDeep(warn);
            } else {
                // Fallback: doc-level update listener
                (doc as any).on?.("update", warn);
            }
        } catch {
            // Last resort fallback
            (doc as any).on?.("update", warn);
        }
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
        // Detach both possible listeners safely
        try {
            (doc as any)?.getMap?.("orderedTree")?.unobserveDeep?.(info.warn);
        } catch {}
        try {
            (doc as any).off?.("update", info.warn);
        } catch {}
        listeners.delete(docName);
    }
}
