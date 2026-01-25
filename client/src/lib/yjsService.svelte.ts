import { userManager } from "../auth/UserManager";
import { getFirebaseFunctionUrl } from "./firebaseFunctionsUrl";
import { getLogger } from "./logger";

const logger = getLogger("yjsService");

// Project management functions

export async function createProject(title: string): Promise<string> {
    try {
        const user = userManager.getCurrentUser();
        if (!user) {
            throw new Error("User not authenticated");
        }

        const idToken = await userManager.auth.currentUser?.getIdToken();
        const url = getFirebaseFunctionUrl("createProject");

        logger.info(`Creating project: ${title}`);

        const response = await fetch(url, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${idToken}`,
            },
            body: JSON.stringify({ title }),
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.message || "Failed to create project");
        }

        const result = await response.json();
        return result.projectId;
    } catch (error) {
        logger.error("Error creating project:", error);
        throw error;
    }
}

export async function listProjects(): Promise<any[]> {
    try {
        const user = userManager.getCurrentUser();
        if (!user) {
            // Return empty list if not logged in
            return [];
        }

        const idToken = await userManager.auth.currentUser?.getIdToken();
        const url = getFirebaseFunctionUrl("listProjects");

        const response = await fetch(url, {
            method: "GET",
            headers: {
                "Authorization": `Bearer ${idToken}`,
            },
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.message || "Failed to list projects");
        }

        const result = await response.json();
        return result.projects;
    } catch (error) {
        logger.error("Error listing projects:", error);
        // Return empty list on error (to not break UI)
        return [];
    }
}

export async function deleteProject(projectId: string): Promise<void> {
    try {
        const user = userManager.getCurrentUser();
        if (!user) {
            throw new Error("User not authenticated");
        }

        const idToken = await userManager.auth.currentUser?.getIdToken();
        const url = getFirebaseFunctionUrl("deleteProject");

        const response = await fetch(url, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${idToken}`,
            },
            body: JSON.stringify({ projectId }),
        });

        if (!response.ok) {
            // Log full response for debugging
            logger.error(`deleteProject response status: ${response.status} ${response.statusText}`);
            let errorMessage = "Failed to delete project";
            try {
                const errorData = await response.json();
                logger.error("deleteProject error data:", errorData);
                errorMessage = errorData.message || errorData.error || errorMessage;
            } catch (e) {
                const text = await response.text();
                logger.error("deleteProject response text:", text);
                // If text is HTML (e.g. 500 error page), use generic message
                if (text.includes("<!DOCTYPE html>")) {
                    errorMessage = `Server Error (${response.status}): ${response.statusText}`;
                } else if (text) {
                    errorMessage = text;
                }
            }
            throw new Error(errorMessage);
        }

        logger.info(`Project deleted: ${projectId}`);
    } catch (error) {
        logger.error("[yjsService] deleteProject exception", error);
        throw error;
    }
}
