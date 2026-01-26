import * as Y from "yjs";
import { userManager } from "../auth/UserManager";
import { YjsClient } from "../yjs/YjsClient";
import { getFirebaseFunctionUrl } from "./firebase-app";
import { getLogger } from "./logger";

const logger = getLogger("yjsService");

class YjsService {
    private client: YjsClient | null = null;
    private projectId: string | null = null;

    constructor() {}

    initialize(projectId: string) {
        if (this.client && this.projectId === projectId) {
            return;
        }

        if (this.client) {
            this.client.destroy();
        }

        this.projectId = projectId;

        // Use YjsClient to connect
        // Note: YjsClient is currently implemented to connect to a specific room (project)
        // If the implementation of YjsClient changes, this will need to be updated.
        // Currently, it seems designed to manage a single connection.
        this.client = new YjsClient(projectId);
    }

    destroy() {
        if (this.client) {
            this.client.destroy();
            this.client = null;
        }
        this.projectId = null;
    }

    getDoc(): Y.Doc | null {
        return this.client ? this.client.doc : null;
    }

    /**
     * Calls a cloud function to create a new project.
     * This is a placeholder. Actual implementation depends on the backend.
     */
    async createProject(title: string): Promise<string> {
        try {
            const createProjectFn = getFirebaseFunctionUrl("createProject");
            const token = await userManager.auth.currentUser?.getIdToken();

            const response = await fetch(createProjectFn, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${token}`,
                },
                body: JSON.stringify({ title }),
            });

            if (!response.ok) {
                throw new Error(`Failed to create project: ${response.statusText}`);
            }

            const data = await response.json();
            return data.projectId;
        } catch (error) { // 'e' was unused, renamed to 'error'
            logger.error("Error creating project", error);
            throw error;
        }
    }
}

export const yjsService = new YjsService();
