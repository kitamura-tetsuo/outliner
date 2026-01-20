import type { Logger } from "pino";
// @ts-ignore
import { SQLite } from "@hocuspocus/extension-sqlite";
import { Config } from "./config.js";

export async function createPersistence(config: Config): Promise<any> {
    if (process.env.DISABLE_Y_LEVELDB === "true") {
        return undefined;
    }

    // Use the configured LEVELDB_PATH for SQLite database path as well for now,
    // or we might want to change the config name.
    // For now, I will use LEVELDB_PATH as the path to the sqlite file.
    // If it is a directory, we might need to append a filename.
    let dbPath = config.LEVELDB_PATH;

    // SQLite extension expects a file path, usually ending in .sqlite or .db
    // If LEVELDB_PATH was a directory, we should probably append a filename.
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

    return persistence;
}

export async function logTotalSize(
    persistence: any,
    logger: Logger,
): Promise<void> {
    // TODO: Implement size calculation for SQLite
    // SQLite extension doesn't expose getAllDocNames or getYDoc directly in the same way as y-leveldb.
    // We would need to query the database directly to get the size of blobs.
    // For now, this functionality is disabled.
    logger.warn({ event: "sqlite_total_size", message: "Size calculation not implemented for SQLite" });
}
