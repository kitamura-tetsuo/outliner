import admin from "firebase-admin";
import { getServiceAccount } from "./firebase-init.js";
import { logger } from "./logger.js";

// Ensure admin is initialized (idempotent)
// Initialization is now handled in index.ts calling initializeFirebase()

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
    logger.info(`[AccessControl] Checking container access for user: ${userId}, container: ${containerId}`);
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
            const accessibleUserIds = data?.accessibleUserIds || [];
            const hasAccess = Array.isArray(accessibleUserIds) && accessibleUserIds.includes(userId);

            logger.info(
                `[AccessControl] projectUsers check: docExists=true, hasAccess=${hasAccess}, userIdsCount=${accessibleUserIds.length}`,
            );

            if (hasAccess) {
                logger.info(`[AccessControl] Access granted via projectUsers collection`);
                return true;
            }
        } else {
            logger.info(`[AccessControl] projectUsers check: docExists=false for container ${containerId}`);
        }

        // 2. Check userProjects collection (user -> projects)
        const userProjectDoc = await db.collection("userProjects").doc(userId).get();
        if (userProjectDoc.exists) {
            const data = userProjectDoc.data();
            const accessibleProjectIds = data?.accessibleProjectIds || [];
            const hasAccess = Array.isArray(accessibleProjectIds) && accessibleProjectIds.includes(containerId);

            logger.info(
                `[AccessControl] userProjects check: docExists=true, hasAccess=${hasAccess}, projectIdsCount=${accessibleProjectIds.length}`,
            );

            if (hasAccess) {
                logger.info(`[AccessControl] Access granted via userProjects collection`);
                return true;
            }
        } else {
            logger.info(`[AccessControl] userProjects check: docExists=false for user ${userId}`);
        }

        // 3. Check containerUsers collection (Legacy)
        const containerUserDoc = await db.collection("containerUsers").doc(containerId).get();
        if (containerUserDoc.exists) {
            const data = containerUserDoc.data();
            if (data?.accessibleUserIds && Array.isArray(data.accessibleUserIds)) {
                if (data.accessibleUserIds.includes(userId)) {
                    return true;
                }
            }
        }

        // 4. Check userContainers collection (Legacy)
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
        logger.error({
            event: "access_check_error",
            message: error instanceof Error ? error.message : String(error),
            userId,
            containerId,
        });
        return false;
    }
}
