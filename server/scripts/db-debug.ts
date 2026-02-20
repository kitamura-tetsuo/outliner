import "dotenv/config";
import chalk from "chalk";
import admin from "firebase-admin";
import inquirer from "inquirer";
import * as Y from "yjs";
import { loadConfig } from "../src/config.js";
import { getServiceAccount } from "../src/firebase-init.js";
import { createPersistence } from "../src/persistence.js";
import { Project } from "../src/schema/app-schema.js";

// We need to define the type for persistence because it returns 'any'
interface Persistence {
    configuration: {
        fetch: (params: { documentName: string; }) => Promise<Uint8Array | undefined>;
        store: (params: { documentName: string; state: Uint8Array; }) => Promise<void>;
    };
    db?: {
        run: (sql: string, params: any[], callback?: (err: Error | null) => void) => void;
        all: (sql: string, params: any[], callback?: (err: Error | null, rows: any[]) => void) => void;
        close: (callback?: (err: Error | null) => void) => void;
    };
    onConfigure: () => Promise<void>;
}

async function main() {
    // Check command line arguments for database path
    const args = process.argv.slice(2);
    if (args.length > 0) {
        process.env.DATABASE_PATH = args[0];
    }

    // Initialize configuration
    const config = loadConfig(process.env);

    // Create persistence instance
    // Note: createPersistence returns a Promise<any> which is the SQLite extension instance
    const persistence = (await createPersistence(config)) as Persistence;

    // Manually initialize the database connection since we are not running within Hocuspocus server
    if (persistence.onConfigure) {
        await persistence.onConfigure();
    }

    console.log(chalk.green(`Connected to database at: ${config.DATABASE_PATH}`));

    let running = true;
    while (running) {
        const { action } = await inquirer.prompt([{
            type: "select",
            name: "action",
            message: "Select an action:",
            choices: [
                { name: "🔍 Inspect Document", value: "inspect" },
                { name: "➕ Create Page in Project", value: "create-page" },
                { name: "🗑️ Delete Document", value: "delete" },
                { name: "🗑️⚠️ Delete All Test Projects", value: "delete-test-projects" },
                { name: "🗑️🔥 Delete Orphaned Firebase Projects", value: "delete-orphaned-firebase" },
                { name: "➕ Add Test Document", value: "add" },
                { name: "🚪 Exit", value: "exit" },
            ],
        }]);

        switch (action) {
            case "inspect":
                await inspectDocument(persistence);
                break;
            case "delete":
                await deleteDocument(persistence);
                break;
            case "create-page":
                await createPageInProject(persistence);
                break;
            case "delete-test-projects":
                await deleteAllTestProjects(persistence);
                break;
            case "delete-orphaned-firebase":
                await deleteOrphanedFirebaseProjects(persistence);
                break;
            case "add":
                await addTestDocument(persistence);
                break;
            case "exit":
                running = false;
                break;
        }

        console.log(); // Empty line for readability
    }

    // Cleanup
    if (persistence.db) {
        persistence.db.close((err) => {
            if (err) console.error(chalk.red("Error closing database:", err.message));
            else console.log(chalk.gray("Database closed."));
            process.exit(0);
        });
    } else {
        process.exit(0);
    }
}

async function listDocuments(persistence: Persistence): Promise<{ name: string; value: string; }[]> {
    if (!persistence.db) return [];
    return new Promise((resolve, reject) => {
        persistence.db!.all('SELECT name, data FROM "documents"', [], (err: Error | null, rows: any[]) => {
            if (err) {
                console.error(chalk.red("Error listing documents:", err.message));
                resolve([]);
            } else {
                const results = rows.map((row) => {
                    const docName = row.name;
                    let displayName = docName;

                    try {
                        const doc = new Y.Doc();
                        Y.applyUpdate(doc, row.data);

                        // Try to get title from metadata
                        const metadata = doc.getMap("metadata");
                        const title = metadata.get("title");

                        if (title && typeof title === "string") {
                            displayName = `${title} (${docName})`;
                        }
                    } catch (e) {
                        // usage of applyUpdate might fail if data is corrupted
                    }

                    return { name: `📄 ${displayName}`, value: docName };
                });
                resolve(results);
            }
        });
    });
}

async function inspectDocument(persistence: Persistence, docName?: string) {
    let documentName = docName;
    if (!documentName) {
        const documents = await listDocuments(persistence);

        if (documents.length === 0) {
            console.log(chalk.red("No documents found in database."));
            return;
        }

        const { selectedDoc } = await inquirer.prompt([{
            type: "select",
            name: "selectedDoc",
            message: "Select a document to inspect:",
            choices: [...documents, new inquirer.Separator(), { name: "🔙 Cancel", value: "🔙 Cancel" }],
            pageSize: 10,
        }]);

        if (selectedDoc === "🔙 Cancel") return;
        documentName = selectedDoc;
    }

    try {
        const data = await persistence.configuration.fetch({ documentName: documentName! });
        if (!data) {
            console.log(chalk.red("Document not found."));
            return;
        }

        const doc = new Y.Doc();
        Y.applyUpdate(doc, data);

        // Construct JSON from shared types
        const result: Record<string, any> = {};
        // Iterate over shared types
        // Yjs Doc doesn't expose an easy iterator for all shared types,
        // but we can access doc.share which is a Map
        for (const [key, type] of doc.share) {
            // type is AbstractType<any>
            // We can call toJSON() on it
            result[key] = type.toJSON();
        }

        console.log(chalk.cyan("Metadata:"));
        console.log(JSON.stringify(doc.getMap("metadata").toJSON(), null, 2));

        console.log(chalk.cyan("Document Content:"));
        console.log(JSON.stringify(result, null, 2));
    } catch (e: any) {
        console.error(chalk.red("Error fetching document:", e.message));
    }
}

async function deleteDocument(persistence: Persistence, docName?: string) {
    let documentNames: string[] = [];
    let documentName = docName;
    if (!documentName) {
        const documents = await listDocuments(persistence);

        if (documents.length === 0) {
            console.log(chalk.red("No documents found in database."));
            return;
        }

        const { selectedDocs } = await inquirer.prompt([{
            type: "checkbox",
            name: "selectedDocs",
            message: "Select documents to delete (Space to select, Enter to confirm):",
            choices: [...documents, new inquirer.Separator(), { name: "🔙 Cancel", value: "🔙 Cancel" }],
            pageSize: 15,
        }]);

        if (selectedDocs.includes("🔙 Cancel") || selectedDocs.length === 0) return;

        // Remove "Cancel" if accidentally selected with others (though logic above handles it, let's be safe)
        documentNames = selectedDocs.filter((d: string) => d !== "🔙 Cancel");
    } else {
        documentNames = [documentName];
    }

    const { confirm } = await inquirer.prompt([{
        type: "confirm",
        name: "confirm",
        message: `Are you sure you want to delete ${documentNames.length} document(s)?`,
        default: false,
    }]);

    if (!confirm) {
        console.log(chalk.yellow("Deletion cancelled."));
        return;
    }

    if (persistence.db) {
        let deletedCount = 0;
        for (const doc of documentNames) {
            await new Promise<void>((resolve, reject) => {
                persistence.db!.run('DELETE FROM "documents" WHERE name = ?', [doc], (err) => {
                    if (err) {
                        console.error(chalk.red(`Error deleting document "${doc}":`, err.message));
                        resolve();
                    } else {
                        console.log(chalk.green(`Document "${doc}" deleted successfully.`));
                        deletedCount++;
                        resolve();
                    }
                });
            });
        }
        console.log(chalk.green(`\nDeletion completed. Deleted ${deletedCount} documents.`));
    } else {
        console.error(chalk.red("Database instance not available."));
    }
}

async function deleteAllTestProjects(persistence: Persistence) {
    if (!persistence.db) {
        console.error(chalk.red("Database instance not available."));
        return;
    }

    console.log(chalk.blue("Scanning valid test projects..."));

    // 1. Get all documents
    const allDocs = await new Promise<{ name: string; data: any; }[]>((resolve, reject) => {
        persistence.db!.all('SELECT name, data FROM "documents"', [], (err: Error | null, rows: any[]) => {
            if (err) {
                console.error(chalk.red("Error fetching documents:", err.message));
                resolve([]);
            } else {
                resolve(rows);
            }
        });
    });

    if (allDocs.length === 0) {
        console.log(chalk.yellow("No documents found in database."));
        return;
    }

    const testProjectRegex = /^Test Project \d+ \d+$/;
    const projectIdsToDelete = new Set<string>();
    const docNamesToDelete = new Set<string>();

    // 2. Identify projects to delete
    for (const docRow of allDocs) {
        const docName = docRow.name;

        try {
            const doc = new Y.Doc();
            Y.applyUpdate(doc, docRow.data);
            const metadata = doc.getMap("metadata");
            const title = metadata.get("title");

            if (typeof title === "string" && testProjectRegex.test(title)) {
                // Assuming docName is like "projects/{projectId}"
                const parts = docName.split("/");
                if (parts.length === 2 && parts[0] === "projects") {
                    const projectId = parts[1];
                    console.log(chalk.gray(`Found project: "${title}" (${projectId})`));
                    projectIdsToDelete.add(projectId);
                    docNamesToDelete.add(docName);
                }
            }
        } catch (e) {
            // ignore malformed docs
        }
    }

    if (projectIdsToDelete.size === 0) {
        console.log(chalk.yellow("No test projects matching pattern found."));
        return;
    }

    console.log(chalk.yellow(`\nFound ${projectIdsToDelete.size} test projects.`));
    console.log(chalk.yellow(`Total documents to delete: ${docNamesToDelete.size}`));

    // Preview a few
    const preview = Array.from(docNamesToDelete).slice(0, 5);
    preview.forEach(name => console.log(chalk.gray(` - ${name}`)));
    if (docNamesToDelete.size > 5) console.log(chalk.gray(` ... and ${docNamesToDelete.size - 5} more`));

    const { confirm } = await inquirer.prompt([{
        type: "confirm",
        name: "confirm",
        message: `⚠️  Are you sure you want to PERMANENTLY delete these ${docNamesToDelete.size} documents?`,
        default: false,
    }]);

    if (!confirm) {
        console.log(chalk.yellow("Deletion cancelled."));
        return;
    }

    // 5. Execute deletion
    let deletedCount = 0;
    // We can do this in parallel or bulk, but sequential is safer for sqlite locking
    console.log(chalk.blue("Deleting..."));

    for (const docName of docNamesToDelete) {
        await new Promise<void>((resolve) => {
            persistence.db!.run('DELETE FROM "documents" WHERE name = ?', [docName], (err) => {
                if (err) {
                    console.error(chalk.red(`Failed to delete ${docName}: ${err.message}`));
                } else {
                    deletedCount++;
                }
                resolve();
            });
        });
    }

    console.log(chalk.green(`Successfully deleted ${deletedCount} documents.`));
}

async function deleteOrphanedFirebaseProjects(persistence: Persistence) {
    console.log(chalk.blue("Initializing Firebase Admin..."));

    async function initAdmin() {
        if (admin.apps.length > 0) return true;
        try {
            await loadConfig(process.env); // Ensure ENV is loaded
            const serviceAccount = getServiceAccount();

            const isEmulator = process.env.USE_FIREBASE_EMULATOR === "true"
                || process.env.FIREBASE_AUTH_EMULATOR_HOST
                || process.env.FIRESTORE_EMULATOR_HOST
                || process.env.FIREBASE_EMULATOR_HOST;

            if (
                isEmulator
                && (!serviceAccount.private_key || serviceAccount.private_key.includes("Your Private Key Here"))
            ) {
                admin.initializeApp({ projectId: serviceAccount.project_id });
            } else {
                admin.initializeApp({
                    credential: admin.credential.cert(serviceAccount),
                });
            }
            return true;
        } catch (e: any) {
            console.error(chalk.red("Failed to initialize Firebase:", e.message));
            return false;
        }
    }

    if (!(await initAdmin())) return;

    const firestore = admin.firestore();
    console.log(chalk.blue("Fetching Firestore projects..."));

    let firestoreProjects: string[] = [];
    try {
        const snapshot = await firestore.collection("projects").get();
        firestoreProjects = snapshot.docs.map(doc => doc.id);
    } catch (e: any) {
        console.error(chalk.red("Failed to fetch Firestore projects:", e.message));
        return;
    }

    if (firestoreProjects.length === 0) {
        console.log(chalk.yellow("No projects found in Firestore."));
        return;
    }

    console.log(chalk.blue(`Found ${firestoreProjects.length} projects in Firestore.`));
    console.log(chalk.blue("Fetching local SQLite projects..."));

    // Get all project IDs from SQLite
    // Local projects are stored as "projects/{id}"
    const localDocs = await listDocuments(persistence);
    const localProjectIds = new Set<string>();

    for (const doc of localDocs) {
        const parts = doc.value.split("/");
        if (parts.length >= 2 && parts[0] === "projects") {
            // "projects/abc" -> abc
            localProjectIds.add(parts[1]);
        }
    }

    console.log(chalk.blue(`Found ${localProjectIds.size} unique projects in SQLite.`));

    // Find orphans
    const orphans = firestoreProjects.filter(id => !localProjectIds.has(id));

    if (orphans.length === 0) {
        console.log(chalk.green("No orphaned projects found (all Firestore projects exist locally)."));
        return;
    }

    console.log(chalk.yellow(`\nFound ${orphans.length} orphaned projects in Firebase:`));

    const preview = orphans.slice(0, 10);
    preview.forEach(id => console.log(chalk.gray(` - ${id}`)));
    if (orphans.length > 10) console.log(chalk.gray(` ... and ${orphans.length - 10} more`));

    const { confirm } = await inquirer.prompt([{
        type: "confirm",
        name: "confirm",
        message: `⚠️  Are you sure you want to PERMANENTLY delete these ${orphans.length} projects from Firebase?`,
        default: false,
    }]);

    if (!confirm) {
        console.log(chalk.yellow("Deletion cancelled."));
        return;
    }

    console.log(chalk.blue("Deleting..."));
    let deletedCount = 0;

    for (const projectId of orphans) {
        try {
            const ref = firestore.collection("projects").doc(projectId);
            await firestore.recursiveDelete(ref);
            deletedCount++;
            if (deletedCount % 10 === 0) {
                process.stdout.write(".");
            }
        } catch (e: any) {
            console.error(chalk.red(`\nFailed to delete project ${projectId}: ${e.message}`));
        }
    }

    console.log(chalk.green(`\nSuccessfully deleted ${deletedCount} orphaned projects from Firebase.`));
}

async function addTestDocument(persistence: Persistence) {
    const { documentName } = await inquirer.prompt([{
        type: "input",
        name: "documentName",
        message: "Enter new document name:",
    }]);

    const doc = new Y.Doc();
    // Add some default content
    doc.getText("content").insert(0, "Hello World");

    // Add some metadata
    const map = doc.getMap("metadata");
    map.set("created_at", new Date().toISOString());
    map.set("created_by", "db-debug-cli");

    const update = Y.encodeStateAsUpdate(doc);

    try {
        await persistence.configuration.store({ documentName, state: update });
        console.log(chalk.green(`Test document "${documentName}" created successfully.`));
    } catch (e: any) {
        console.error(chalk.red("Error creating document:", e.message));
    }
}

async function createPageInProject(persistence: Persistence) {
    const documents = await listDocuments(persistence);
    const projects = documents.filter(d => d.value.startsWith("projects/"));

    if (projects.length === 0) {
        console.log(chalk.red("No projects found in database."));
        return;
    }

    const { projectId } = await inquirer.prompt([{
        type: "select",
        name: "projectId",
        message: "Select a project to add a page to:",
        choices: [...projects, new inquirer.Separator(), { name: "🔙 Cancel", value: "🔙 Cancel" }],
        pageSize: 10,
    }]);

    if (projectId === "🔙 Cancel") return;

    const { pageTitle } = await inquirer.prompt([{
        type: "input",
        name: "pageTitle",
        message: "Enter the new page title:",
    }]);

    if (!pageTitle) {
        console.log(chalk.yellow("Page creation cancelled (no title)."));
        return;
    }

    try {
        // Fetch project
        const projectData = await persistence.configuration.fetch({ documentName: projectId });
        if (!projectData) {
            console.log(chalk.red("Project document not found."));
            return;
        }

        const projectDoc = new Y.Doc();
        Y.applyUpdate(projectDoc, projectData);

        const project = Project.fromDoc(projectDoc);

        // Add page
        const page = project.addPage(pageTitle, "db-debug-cli");

        // Save project doc update
        const projectUpdate = Y.encodeStateAsUpdate(projectDoc);
        await persistence.configuration.store({ documentName: projectId, state: projectUpdate });

        console.log(chalk.green(`Successfully created page "${pageTitle}" in project ${projectId}.`));
        console.log(chalk.gray(`Page node added to project document.`));
    } catch (e: any) {
        console.error(chalk.red("Error creating page:", e.message));
    }
}

main().catch(console.error);
