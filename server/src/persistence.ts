import { SQLite } from "@hocuspocus/extension-sqlite";
import type { Logger } from "pino";
import { Config } from "./config.js";
import { initializeScheduleIndex } from "./scheduler/schedule-indexer.js";

export async function createPersistence(config: Config): Promise<any> {
    if (process.env.DISABLE_PERSISTENCE === "true") {
        return undefined;
    }

    let dbPath = config.DATABASE_PATH;

    // SQLite extension expects a file path, usually ending in .sqlite or .db
    // If DATABASE_PATH was a directory, we should probably append a filename.
    // Assuming the user will update the config or we handle it here.
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

    const persistence = new SQLite({
        database: dbPath,
    });

    // @hocuspocus/extension-sqlite doesn't create the DB immediately until onConfigure
    // But we can initialize it after we're sure it's created. We will do this via a small hack or
    // waiting for its onConfigure, or since SQLite is synchronous, we can just do it.
    // Let's check when persistence.db is available.

    // Actually, persistence.db is created immediately in constructor for SQLite extension in hocuspocus.
    if (persistence.db) {
        initializeScheduleIndex(persistence.db as any);
    }

    return persistence;
}
