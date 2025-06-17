import { createDialect, createInMemoryDatabase } from 'sqlite-wasm-kysely';
import { Kysely } from 'kysely';

interface Page {
    id: string;
    title: string;
    content: string;
}

let db: Kysely<{ pages: Page }>|undefined;

async function init() {
    if (!db) {
        const sqlite = await createInMemoryDatabase({ readOnly: false });
        db = new Kysely<{ pages: Page }>({ dialect: createDialect({ database: sqlite }) });
        await db.schema
            .createTable('pages')
            .ifNotExists()
            .addColumn('id', 'text', col => col.primaryKey())
            .addColumn('title', 'text')
            .addColumn('content', 'text')
            .execute();
    }
}

self.onmessage = async (e: MessageEvent) => {
    const { id, type, payload } = e.data;
    try {
        await init();
        // if (!db) throw new Error("DB not initialized");
        let result: any;
        switch (type) {
            case "init":
                // initialization handled lazily
                result = true;
                break;
            case "addPage":
                await db!
                    .insertInto("pages")
                    .values(payload)
                    .execute();
                result = true;
                break;
            case "getPage":
                result = await db!
                    .selectFrom("pages")
                    .selectAll()
                    .where("id", "=", payload.id)
                    .executeTakeFirst();
                break;
            case "updatePage":
                await db!
                    .updateTable("pages")
                    .set(payload)
                    .where("id", "=", payload.id)
                    .execute();
                result = true;
                break;
            case "deletePage":
                await db!
                    .deleteFrom("pages")
                    .where("id", "=", payload.id)
                    .execute();
                result = true;
                break;
            case "getAllPages":
                result = await db!
                    .selectFrom("pages")
                    .selectAll()
                    .execute();
                break;
            default:
                throw new Error("Unknown type");
        }
        // send result
        (self as any).postMessage({ id, result });
    }
    catch (err: any) {
        (self as any).postMessage({ id, error: err.message });
    }
};
