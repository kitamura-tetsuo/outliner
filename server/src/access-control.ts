import admin from "firebase-admin";
import { logger } from "./logger";

// Ensure admin is initialized (idempotent)
if (!admin.apps.length) {
    if (process.env.FIREBASE_PROJECT_ID) {
        admin.initializeApp({ projectId: process.env.FIREBASE_PROJECT_ID });
    } else {
        admin.initializeApp();
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
    firestoreInstance?: admin.firestore.Firestore
): Promise<boolean> {
    // In test/dev environment, allow access if explicitly allowed or strictly in test mode
    if (
        process.env.FUNCTIONS_EMULATOR === "true" ||
        process.env.NODE_ENV === "test" ||
        process.env.NODE_ENV === "development" ||
        process.env.ALLOW_TEST_ACCESS === "true"
    ) {
        logger.debug({ event: "access_check_bypass", userId, containerId });
        return true;
    }

    try {
        const db = firestoreInstance || admin.firestore();

        // 1. Check containerUsers collection (container -> users)
        const containerUserDoc = await db.collection("containerUsers").doc(containerId).get();
        if (containerUserDoc.exists) {
            const data = containerUserDoc.data();
            if (data?.accessibleUserIds && Array.isArray(data.accessibleUserIds)) {
                if (data.accessibleUserIds.includes(userId)) {
                    return true;
                }
            }
        }

        // 2. Check userContainers collection (user -> containers)
        const userContainerDoc = await db.collection("userContainers").doc(userId).get();
        if (userContainerDoc.exists) {
            const data = userContainerDoc.data();
            if (data?.accessibleContainerIds && Array.isArray(data.accessibleContainerIds)) {
                if (data.accessibleContainerIds.includes(containerId)) {
                    return true;
                }
            }
        }

        logger.warn({ event: "access_denied", userId, containerId });
        return false;

    } catch (error) {
        // Log the full error object for debugging, but treat as denied safe-fail
        logger.error({ event: "access_check_error", message: error instanceof Error ? error.message : String(error), userId, containerId });
        return false;
    }
}
