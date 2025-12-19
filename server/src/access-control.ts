import admin from "firebase-admin";
import { logger } from "./logger";

// Check if user has access to a specific container
// firestoreInstance is optional, for testing injection
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function checkContainerAccess(
    userId: string,
    containerId: string,
    firestoreInstance?: any,
): Promise<boolean> {
    // In test environment, allow access if explicitly configured
    if (process.env.NODE_ENV === "test" && process.env.ALLOW_TEST_ACCESS === "true") {
        return true;
    }

    try {
        let db;
        if (firestoreInstance) {
            db = firestoreInstance;
        } else {
            // Ensure admin is initialized (it should be by websocket-auth or server.ts)
            if (!admin.apps.length) {
                // This should ideally not happen if server.ts initializes it
                // but for safety we can try to init if project ID is available
                if (process.env.FIREBASE_PROJECT_ID) {
                    admin.initializeApp({ projectId: process.env.FIREBASE_PROJECT_ID });
                } else {
                    admin.initializeApp();
                }
            }
            db = admin.firestore();
        }

        // Check if user is in containerUsers collection
        // This is the primary source of truth for "who can access this container"
        const containerUserDoc = await db.collection("containerUsers").doc(containerId).get();

        if (containerUserDoc.exists) {
            const containerData = containerUserDoc.data();
            if (
                containerData?.accessibleUserIds
                && Array.isArray(containerData.accessibleUserIds)
                && containerData.accessibleUserIds.includes(userId)
            ) {
                return true;
            }
        }

        // Check if container is in user's containers list
        // This is a secondary check (denormalized data)
        const userContainerDoc = await db.collection("userContainers").doc(userId).get();

        if (userContainerDoc.exists) {
            const userData = userContainerDoc.data();

            if (
                userData?.accessibleContainerIds
                && Array.isArray(userData.accessibleContainerIds)
            ) {
                if (userData.accessibleContainerIds.includes(containerId)) {
                    return true;
                }
            }
        }

        logger.warn({ event: "access_denied", userId, containerId });
        return false;
    } catch (error) {
        logger.error({
            event: "access_check_error",
            error: error instanceof Error ? error.message : String(error),
        });
        return false;
    }
}
