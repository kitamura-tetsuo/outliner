import { SQLite } from "@hocuspocus/extension-sqlite";
import type { Document, fetchPayload, storePayload } from "@hocuspocus/server";
import * as Y from "yjs";
import { Config } from "./config.js";

export async function createPersistence(config: Config): Promise<InstanceType<typeof SQLite> | undefined> {
    if (process.env.DISABLE_PERSISTENCE === "true") {
        return undefined;
    }

    let dbPath = config.DATABASE_PATH;

    // Append default database.sqlite filename if DATABASE_PATH does not specify a .sqlite or .db file.
    if (!dbPath.endsWith(".sqlite") && !dbPath.endsWith(".db")) {
        dbPath = `${dbPath}/database.sqlite`;
    }

    // Ensure directory exists
    const fs = await import("fs");
    const path = await import("path");
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }

    // Note: the extension opens its database in onConfigure (i.e. when
    // Hocuspocus is configured), so `persistence.db` does not exist yet here.
    // The schedule index is created in startServer once it does.
    return new SQLite({
        database: dbPath,
    });
}

/**
 * Durably write one live Hocuspocus document's complete state and resolve only
 * once the write is acknowledged by storage. Hocuspocus' own store hook is
 * debounced and swallows failures, so a caller that must know whether its
 * update reached disk (e.g. standalone Table creation, issue #5411) uses this
 * instead. It serializes with Hocuspocus' own stores through the document's
 * save mutex and rejects on any storage failure.
 */
export type DocumentStore = (documentName: string, document: Y.Doc) => Promise<void>;
export type DocumentLoader = (documentName: string) => Promise<Y.Doc | undefined>;

/** Load an independent snapshot through the configured production persistence adapter. */
export function createDocumentLoader(persistence: InstanceType<typeof SQLite>): DocumentLoader {
    return async documentName => {
        if (!persistence.db) throw new Error("Persistence database is not open");
        const stored = await persistence.configuration.fetch({ documentName } as unknown as fetchPayload);
        if (!stored) return undefined;
        const document = new Y.Doc();
        Y.applyUpdate(document, new Uint8Array(stored));
        return document;
    };
}

export function createDocumentStore(persistence: InstanceType<typeof SQLite>): DocumentStore {
    return async (documentName, document) => {
        const write = async () => {
            // The extension's store silently no-ops before its database is
            // opened; that must never be reported as acknowledged storage.
            if (!persistence.db) throw new Error("Persistence database is not open");
            const state = Buffer.from(Y.encodeStateAsUpdate(document));
            await persistence.configuration.store({ documentName, document, state } as unknown as storePayload);
            const stored = await persistence.configuration.fetch({ documentName } as unknown as fetchPayload);
            if (!stored || !Buffer.from(stored).equals(state)) {
                throw new Error(`Stored state for ${documentName} could not be confirmed`);
            }
        };
        const mutex = (document as Partial<Pick<Document, "saveMutex">>).saveMutex;
        await (mutex ? mutex.runExclusive(write) : write());
    };
}
