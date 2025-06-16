import { Kysely } from "kysely";
import {
    contentFromDatabase,
    createDialect,
    createInMemoryDatabase,
    loadDatabaseInMemory,
} from "sqlite-wasm-kysely";

interface DB {
    containers: {
        id: string;
        title: string;
    };
}

let dbPromise: Promise<Kysely<DB>> | null = null;
const STORAGE_KEY = "wasm_db";

async function open(): Promise<Kysely<DB>> {
    if (!dbPromise) {
        dbPromise = (async () => {
            let database;
            if (typeof window !== "undefined") {
                const stored = localStorage.getItem(STORAGE_KEY);
                if (stored) {
                    const data = Uint8Array.from(atob(stored), c => c.charCodeAt(0));
                    database = await loadDatabaseInMemory(data.buffer);
                }
            }
            if (!database) {
                database = await createInMemoryDatabase({ readOnly: false });
                await database.exec("CREATE TABLE IF NOT EXISTS containers (id TEXT PRIMARY KEY, title TEXT)");
            }
            return new Kysely<DB>({ dialect: createDialect({ database }) });
        })();
    }
    return dbPromise;
}

async function persist(db: Kysely<DB>) {
    if (typeof window === "undefined") return;

    // テスト環境では config が undefined の場合があるため、安全にアクセス
    const dialectConfig = (db as any).dialect?.config;
    if (!dialectConfig?.database) {
        console.warn("[wasmDb] Database config not available, skipping persistence");
        return;
    }

    const binary = contentFromDatabase(dialectConfig.database);
    const base64 = btoa(String.fromCharCode(...binary));
    localStorage.setItem(STORAGE_KEY, base64);
}

export async function saveContainerMeta(id: string, title: string) {
    const db = await open();
    await db
        .insertInto("containers")
        .values({ id, title })
        .onConflict(oc => oc.column("id").doUpdateSet({ title }))
        .execute();
    await persist(db);
}

export async function getAllContainerMeta(): Promise<{ id: string; title: string; }[]> {
    const db = await open();
    return await db.selectFrom("containers").selectAll().execute();
}
