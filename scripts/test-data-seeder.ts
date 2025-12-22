import admin from "firebase-admin";
import { v4 as uuid } from "uuid";
import WebSocket from "ws";
import { WebsocketProvider } from "y-websocket";
import * as Y from "yjs";

// Since we're in Node.js, we need to polyfill WebSocket
const ws = WebSocket as any;

const TEST_YJS_PORT = process.env.TEST_YJS_PORT || "7093";
const YJS_SERVER_URL = process.env.YJS_SERVER_URL || `ws://localhost:${TEST_YJS_PORT}`;

// Firebase setup for authentication
const FIREBASE_AUTH_EMULATOR_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST || "localhost:59099";
const FIREBASE_PROJECT_ID = process.env.FIREBASE_PROJECT_ID || "test-project-id";

// Set emulator environment variable before initializing
process.env.FIREBASE_AUTH_EMULATOR_HOST = FIREBASE_AUTH_EMULATOR_HOST;

// Initialize Firebase Admin
if (!admin.apps.length) {
    admin.initializeApp({
        projectId: FIREBASE_PROJECT_ID,
    });
}

// Simplified Yjs project structure (compatible with app-schema.ts but without the schema import)
// This avoids the "Yjs was already imported" dual-import issue
class SimpleProject {
    public readonly ydoc: Y.Doc;
    private readonly orderedTree: Y.Map<any>;
    private readonly metadata: Y.Map<any>;

    constructor(ydoc: Y.Doc) {
        this.ydoc = ydoc;
        this.orderedTree = ydoc.getMap("orderedTree");
        this.metadata = ydoc.getMap("metadata");

        // Initialize the ordered tree structure if not present
        if (!this.orderedTree.has("_parent")) {
            this.orderedTree.set("_parent", new Y.Map());
        }
        if (!this.orderedTree.has("_children")) {
            this.orderedTree.set("_children", new Y.Map());
        }
    }

    get title(): string {
        return this.metadata.get("title") as string ?? "";
    }

    set title(v: string) {
        this.metadata.set("title", v);
    }

    addPage(title: string, author: string): string {
        const pageId = uuid();

        // Create node data for the page
        const nodeData = new Y.Map();
        nodeData.set("id", pageId);
        nodeData.set("text", new Y.Text(title));
        nodeData.set("author", author);
        nodeData.set("collapsed", false);
        nodeData.set("checkbox", false);
        nodeData.set("aliasTargetId", undefined);
        nodeData.set("createdAt", Date.now());
        nodeData.set("updatedAt", Date.now());

        // Store the node in orderedTree
        this.orderedTree.set(pageId, nodeData);

        // Update parent-child relationships
        const parentMap = this.orderedTree.get("_parent") as Y.Map<string>;
        const childrenMap = this.orderedTree.get("_children") as Y.Map<Y.Array<string>>;

        parentMap.set(pageId, "root");

        // Get or create root children array
        let rootChildren = childrenMap.get("root");
        if (!rootChildren) {
            rootChildren = new Y.Array<string>();
            childrenMap.set("root", rootChildren);
        }
        rootChildren.push([pageId]);

        // Create a subdoc for the page content
        const pages = this.ydoc.getMap<Y.Doc>("pages");
        const subdoc = new Y.Doc({ guid: pageId } as any);
        pages.set(pageId, subdoc);

        console.log(`Page "${title}" added with ID: ${pageId}`);
        return pageId;
    }
}

class TestDataSeeder {
    private idToken: string | null = null;

    private async getOrCreateTestUser(): Promise<string> {
        const testEmail = "seeder@test.local";
        const testPassword = "testpassword123";

        try {
            // Try to get existing user
            const user = await admin.auth().getUserByEmail(testEmail);
            // Generate a custom token and exchange it for an ID token via REST API
            const customToken = await admin.auth().createCustomToken(user.uid);
            const idToken = await this.exchangeCustomTokenForIdToken(customToken);
            return idToken;
        } catch (error: any) {
            if (error.code === "auth/user-not-found") {
                // Create user if not found
                const newUser = await admin.auth().createUser({
                    email: testEmail,
                    password: testPassword,
                    emailVerified: true,
                });
                const customToken = await admin.auth().createCustomToken(newUser.uid);
                const idToken = await this.exchangeCustomTokenForIdToken(customToken);
                return idToken;
            }
            throw error;
        }
    }

    private async exchangeCustomTokenForIdToken(customToken: string): Promise<string> {
        // Use Firebase Auth emulator REST API to exchange custom token for ID token
        const response = await fetch(
            `http://${FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=fake-api-key`,
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    token: customToken,
                    returnSecureToken: true,
                }),
            },
        );

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Failed to exchange custom token: ${response.status} ${errorText}`);
        }

        const data = await response.json() as { idToken: string; };
        return data.idToken;
    }

    private async ensureAuthenticated(): Promise<void> {
        if (!this.idToken) {
            console.log("Authenticating with Firebase Auth emulator...");
            this.idToken = await this.getOrCreateTestUser();
            console.log("Authentication successful.");
        }
    }

    async connectToProject(projectId: string): Promise<{ doc: Y.Doc; provider: WebsocketProvider; }> {
        await this.ensureAuthenticated();

        const doc = new Y.Doc();
        // Room name for y-websocket - this gets appended to the server URL
        const roomName = `projects/${projectId}`;
        // y-websocket constructs URL as: `${serverUrl}/${roomname}?${params}`
        const provider = new WebsocketProvider(YJS_SERVER_URL, roomName, doc, {
            WebSocketPolyfill: ws,
            params: { auth: this.idToken! },
        });

        return new Promise((resolve, reject) => {
            let resolved = false;
            let connected = false;

            const timeoutId = setTimeout(() => {
                if (!resolved) {
                    resolved = true;
                    provider.disconnect();
                    reject(new Error(`Connection timeout for project ${projectId}`));
                }
            }, 10000);

            provider.on("status", (event: { status: string; }) => {
                if (event.status === "connected" && !connected) {
                    connected = true;
                    console.log(`Connected to project: ${projectId}`);
                    // For a new document, synced may never fire, so resolve after a short delay
                    // to allow initial sync to complete
                    setTimeout(() => {
                        if (!resolved) {
                            resolved = true;
                            clearTimeout(timeoutId);
                            resolve({ doc, provider });
                        }
                    }, 500);
                }
            });

            provider.on("synced", (event: { synced: boolean; }) => {
                if (event.synced && !resolved) {
                    resolved = true;
                    clearTimeout(timeoutId);
                    console.log(`Synced with project: ${projectId}`);
                    resolve({ doc, provider });
                }
            });

            // Handle connection errors
            provider.on("connection-error", (event: any) => {
                if (!resolved) {
                    resolved = true;
                    clearTimeout(timeoutId);
                    reject(new Error(`Connection error for project ${projectId}: ${event.error}`));
                }
            });

            provider.on("connection-close", (event: any) => {
                if (!resolved) {
                    resolved = true;
                    clearTimeout(timeoutId);
                    reject(new Error(`Connection closed unexpectedly for project ${projectId}: ${event}`));
                }
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

    private async _withProject(projectId: string, action: (project: SimpleProject) => Promise<void> | void) {
        const { doc, provider } = await this.connectToProject(projectId);
        const project = new SimpleProject(doc);

        await action(project);

        // Wait a bit for changes to propagate
        await new Promise<void>((resolve) => {
            setTimeout(resolve, 500);
        });

        console.log("Changes synced successfully.");
        provider.disconnect();
        provider.destroy();
        doc.destroy();
    }

    async addPage(projectId: string, title: string) {
        await this._withProject(projectId, (project) => {
            console.log(`Adding page "${title}" to project ${projectId}`);
            project.addPage(title, "seeder");
        });
    }

    async addTextNode(projectId: string, pageId: string, text: string) {
        await this._withProject(projectId, (project) => {
            console.log(`Adding text node to page ${pageId} in project ${projectId}`);
            // For now, text nodes are not fully implemented in the simplified schema
            // This would need more complex tree manipulation
            console.log(`Text node would be added with text: "${text}"`);
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
