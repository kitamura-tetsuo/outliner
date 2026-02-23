import "dotenv/config";
import * as Y from "yjs";
import { loadConfig } from "../src/config.js";
import { createPersistence } from "../src/persistence.js";
import { Project } from "../src/schema/app-schema.js";

async function main() {
    process.env.DATABASE_PATH = "/srv/docker/outliner-yjs-ws/ydb_data/database.sqlite";
    const config = loadConfig(process.env);
    const persistence = await createPersistence(config);
    if (persistence.onConfigure) await persistence.onConfigure();

    const docName = "projects/4a934322-05de-4c97-932c-bc87fb43e18c";
    let data = await persistence.configuration.fetch({ documentName: docName });
    const doc = new Y.Doc();
    if (data) {
        Y.applyUpdate(doc, data);
    }

    const project = Project.fromDoc(doc);
    project.addPage("Restored Page", "system");

    const update = Y.encodeStateAsUpdate(doc);
    await persistence.configuration.store({ documentName: docName, state: update });

    console.log("Page added successfully to", docName);
    process.exit(0);
}

main().catch(console.error);
