import admin from "firebase-admin";
import { logger } from "./logger.js";

// Ensure admin is initialized (idempotent)
if (!admin.apps.length) {
    // Skip initialization in test environment if explicit flag is set or no creds available
    if (process.env.NODE_ENV !== "test" && process.env.SKIP_FIREBASE_INIT !== "true") {
        if (process.env.FIREBASE_PROJECT_ID) {
            admin.initializeApp({ projectId: process.env.FIREBASE_PROJECT_ID });
        } else {
            admin.initializeApp();
        }
    }
}

/**
 * Checks if a user has access to a specific container (project).
 * mirrors logic from functions/index.js
 */
export async function checkContainerAccess(
    userId: string,
    containerId: string,
    // Allow dependency injection for testing
    firestoreInstance?: admin.firestore.Firestore,
): Promise<boolean> {
    // In test/dev environment, allow access if explicitly allowed or strictly in test mode
    if (
        process.env.FUNCTIONS_EMULATOR === "true"
        || process.env.NODE_ENV === "test"
        || process.env.ALLOW_TEST_ACCESS === "true"
    ) {
        if (process.env.ALLOW_TEST_ACCESS === "true") {
            logger.warn({ event: "access_check_bypass", userId, containerId, reason: "ALLOW_TEST_ACCESS_ENABLED" });
        } else {
            logger.debug({ event: "access_check_bypass", userId, containerId });
        }
        return true;
    }

    try {
        const db = firestoreInstance || admin.firestore();

        // 1. Check projectUsers collection (project -> users)
        const projectUserDoc = await db.collection("projectUsers").doc(containerId).get();
        if (projectUserDoc.exists) {
            const data = projectUserDoc.data();
            if (data?.accessibleUserIds && Array.isArray(data.accessibleUserIds)) {
                if (data.accessibleUserIds.includes(userId)) {
                    return true;
                }
            }
        }

        // 2. Check userProjects collection (user -> projects)
        const userProjectDoc = await db.collection("userProjects").doc(userId).get();
        if (userProjectDoc.exists) {
            const data = userProjectDoc.data();
            if (data?.accessibleProjectIds && Array.isArray(data.accessibleProjectIds)) {
                if (data.accessibleProjectIds.includes(containerId)) {
                    return true;
                }
            }
        }

        logger.warn({ event: "access_denied", userId, containerId });
        return false;
    } catch (error) {
        // Log the full error object for debugging, but treat as denied safe-fail
        logger.error({
            event: "access_check_error",
            message: error instanceof Error ? error.message : String(error),
            userId,
            containerId,
        });
        return false;
    }
}
