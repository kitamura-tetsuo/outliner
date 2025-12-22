import { v4 as uuid } from "uuid";
import WebSocket from "ws";
import { WebsocketProvider } from "y-websocket";
import * as Y from "yjs";
import { Project } from "../client/src/schema/app-schema.ts";

// Since we're in Node.js, we need to polyfill WebSocket
const ws = WebSocket as any;

const YJS_SERVER_URL = process.env.YJS_SERVER_URL || "ws://localhost:7080";

class TestDataSeeder {
    async connectToProject(projectId: string): Promise<{ doc: Y.Doc; provider: WebsocketProvider; }> {
        const doc = new Y.Doc();
        const provider = new WebsocketProvider(YJS_SERVER_URL, projectId, doc, {
            WebSocketPolyfill: ws,
        });

        return new Promise((resolve, reject) => {
            provider.on("status", (event: { status: string; }) => {
                if (event.status === "connected") {
                    console.log(`Connected to project: ${projectId}`);
                }
            });

            provider.on("synced", (event: { synced: boolean; }) => {
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

    async createProject(name: string, pages: string[]) {
        const projectId = uuid();
        console.log(`Creating project "${name}" with ID: ${projectId}`);

        await this._withProject(projectId, (project) => {
            project.title = name;
            const author = "seeder";
            if (pages.length > 0) {
                pages.forEach((pageTitle) => {
                    project.addPage(pageTitle, author);
                });
            } else {
                project.addPage("Main Page", author);
            }
            console.log(`Project structure for "${name}" created with pages: ${pages.join(", ") || "Main Page"}`);
        });
    }

    async clearAll() {
        console.log("Clearing all test data");
        // TODO: Implement data clearing logic
    }

    private async _withProject(projectId: string, action: (project: Project) => Promise<void> | void) {
        const { doc, provider } = await this.connectToProject(projectId);
        const project = Project.fromDoc(doc);

        await action(project);

        // Wait for changes to be synced
        await new Promise<void>((resolve) => {
            if (provider.synced) {
                resolve();
                return;
            }
            const syncListener = (event: { synced: boolean; }) => {
                if (event.synced) {
                    provider.off("synced", syncListener);
                    resolve();
                }
            };
            provider.on("synced", syncListener);
        });

        console.log("Changes synced successfully.");
        provider.disconnect();
    }

    async addPage(projectId: string, title: string) {
        await this._withProject(projectId, (project) => {
            console.log(`Adding page "${title}" to project ${projectId}`);
            const newPage = project.addPage(title, "seeder");
            console.log(`Page "${title}" added with ID: ${newPage.id}`);
        });
    }

    async addTextNode(projectId: string, pageId: string, text: string) {
        await this._withProject(projectId, (project) => {
            console.log(`Adding text node to page ${pageId} in project ${projectId}`);
            const page = project.items.toArray().find((item) => item.id === pageId);

            if (!page) {
                // This error won't be caught by the main catch block, so we exit here.
                console.error(`Page with ID ${pageId} not found in project ${projectId}`);
                process.exit(1);
            }

            const newNode = page.items.addNode("seeder");
            newNode.updateText(text);
            console.log(`Added text node with ID: ${newNode.id} and text: "${text}"`);
        });
    }
}

async function main() {
    const args = process.argv.slice(2);
    const command = args[0];
    const seeder = new TestDataSeeder();

    switch (command) {
        case "create-project": {
            const [name, ...pages] = args.slice(1);
            if (!name) {
                console.error("Project name is required for create-project");
                process.exit(1);
            }
            await seeder.createProject(name, pages);
            break;
        }
        case "add-page": {
            const [projectId, title] = args.slice(1);
            if (!projectId || !title) {
                console.error("Usage: add-page <projectId> <title>");
                process.exit(1);
            }
            await seeder.addPage(projectId, title);
            break;
        }
        case "add-text-node": {
            const projectId = args[1];
            const pageId = args[2];
            const text = args.slice(3).join(" ");
            if (!projectId || !pageId || !text) {
                console.error("Usage: add-text-node <projectId> <pageId> <text>");
                process.exit(1);
            }
            await seeder.addTextNode(projectId, pageId, text);
            break;
        }
        case "clear-all":
            await seeder.clearAll();
            break;
        default:
            console.error(`Unknown command: ${command}`);
            console.log(
                "Available commands: create-project <name> <pages...>, add-page <projectId> <title>, add-text-node <projectId> <pageId> <text>, clear-all",
            );
            process.exit(1);
    }
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
