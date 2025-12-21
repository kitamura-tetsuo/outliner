import * as Y from "yjs";
import { WebsocketProvider } from "y-websocket";
import WebSocket from "ws";
import { v4 as uuid } from "uuid";
import { Project } from "../client/src/schema/app-schema";

// Since we're in Node.js, we need to polyfill WebSocket
const ws = WebSocket as any;

const YJS_SERVER_URL = process.env.YJS_SERVER_URL || "ws://localhost:7080";

class TestDataSeeder {
    async connectToProject(projectId: string): Promise<{ doc: Y.Doc; provider: WebsocketProvider }> {
        const doc = new Y.Doc();
        const provider = new WebsocketProvider(YJS_SERVER_URL, projectId, doc, {
            WebSocketPolyfill: ws,
        });

        return new Promise((resolve, reject) => {
            provider.on("status", (event: { status: string }) => {
                if (event.status === "connected") {
                    console.log(`Connected to project: ${projectId}`);
                }
            });

            provider.on("synced", (event: { synced: boolean }) => {
                if (event.synced) {
                    console.log(`Synced with project: ${projectId}`);
                    resolve({ doc, provider });
                }
            });

            // Handle connection errors
            provider.on("connection-error", (event: any) => {
                reject(new Error(`Connection error for project ${projectId}: ${event.error}`));
            });
        });
    }

    createProjectStructure(doc: Y.Doc, name: string, pages: string[]) {
        const project = Project.fromDoc(doc);
        project.title = name;
        const author = "seeder";
        if (pages.length > 0) {
            pages.forEach((pageTitle) => {
                project.addPage(pageTitle, author);
            });
        } else {
            // Create a default page if none are specified
            project.addPage("Main Page", author);
        }
        console.log(`Project structure for "${name}" created with pages: ${pages.join(", ") || "Main Page"}`);
    }


    async createProject(name: string, pages: string[]) {
        console.log(`Creating project: ${name} with pages: ${pages.join(", ")}`);
        const projectId = uuid();
        const { doc, provider } = await this.connectToProject(projectId);

        this.createProjectStructure(doc, name, pages);

        // Disconnect after a short delay to ensure data is sent
        setTimeout(() => {
            console.log("Disconnecting...");
            provider.disconnect();
            process.exit(0);
        }, 1000);
    }

    async clearAll() {
        console.log("Clearing all test data");
        // TODO: Implement data clearing logic
    }
}

async function main() {
    const args = process.argv.slice(2);
    const command = args[0];
    const seeder = new TestDataSeeder();

    switch (command) {
        case "create-project":
            const [name, ...pages] = args.slice(1);
            if (!name) {
                console.error("Project name is required for create-project");
                process.exit(1);
            }
            await seeder.createProject(name, pages);
            break;
        case "clear-all":
            await seeder.clearAll();
            break;
        default:
            console.error(`Unknown command: ${command}`);
            console.log("Available commands: create-project <name> <pages...>, clear-all");
            process.exit(1);
    }
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
