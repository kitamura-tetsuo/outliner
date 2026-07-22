import { SQLite } from "@hocuspocus/extension-sqlite";
import type { Logger } from "pino";
import { Config } from "./config.js";
import { initializeScheduleIndex } from "./scheduler/schedule-indexer.js";

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

    const persistence = new SQLite({
        database: dbPath,
    });
    if (persistence.db) {
        initializeScheduleIndex(persistence.db);
    }

    return persistence;
}
