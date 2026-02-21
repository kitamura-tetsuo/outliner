import "dotenv/config";
import * as Y from "yjs";
import { loadConfig } from "../src/config.js";
import { createPersistence } from "../src/persistence.js";

async function main() {
    const dbPath = process.argv[2] || "./data/hocuspocus.sqlite";
    process.env.DATABASE_PATH = dbPath;
    const config = loadConfig(process.env);
    const persistence = await createPersistence(config);
    if (persistence.onConfigure) await persistence.onConfigure();

    const docName = process.argv[3];
    if (!docName) {
        // List documents
        persistence.db!.all('SELECT name FROM "documents"', [], (err, rows) => {
            if (err) console.error(err);
            else console.log(JSON.stringify(rows.map(r => r.name), null, 2));
            process.exit(0);
        });
        return;
    }

    const data = await persistence.configuration.fetch({ documentName: docName });
    if (!data) {
        console.log("Document not found");
        process.exit(1);
    }

    const doc = new Y.Doc();
    Y.applyUpdate(doc, data);
    const result = {};
    for (const [key, type] of doc.share) {
        result[key] = type.toJSON();
    }
    console.log(JSON.stringify(result, null, 2));
    process.exit(0);
}

main().catch(console.error);
