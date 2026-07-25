import { SQLite } from "@hocuspocus/extension-sqlite";
import type { Logger } from "pino";
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
