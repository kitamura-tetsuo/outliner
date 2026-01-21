import type { Logger } from "pino";
// @ts-ignore
import { SQLite } from "@hocuspocus/extension-sqlite";
import { Config } from "./config.js";

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

    return persistence;
}
