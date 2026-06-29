import { getLogger } from "../../lib/logger";
const logger = getLogger("testDataHelper");

import { firestoreStore } from "../../stores/firestoreStore.svelte";

/**
 * Test data helper functions for test environments only
 * These functions should never be used in production code
 */

export interface TestUserProject {
    userId: string;
    defaultProjectId: string;
    accessibleProjectIds: string[];
    createdAt: Date;
    updatedAt: Date;
}

/**
 * Creates test user data for testing purposes
 * Only available in test environments
 */
export function createTestUserData(): TestUserProject {
    const testUserProject: TestUserProject = {
        userId: "test-user-id",
        defaultProjectId: "test-project-1",
        accessibleProjectIds: ["test-project-1", "test-project-2"],
        createdAt: new Date(),
        updatedAt: new Date(),
    };

    // Set test data in firestoreStore using public API to ensure reactivity wrapping
    (firestoreStore as unknown as {
        setUserProject: (project: import("../../stores/firestoreStore.svelte").UserProject) => void;
    }).setUserProject(testUserProject as import("../../stores/firestoreStore.svelte").UserProject);

    return testUserProject;
}

/**
 * Clears all test data
 * Only available in test environments
 */
export function clearTestData(): void {
    firestoreStore.userProject = null;
}

/**
 * Sets up test environment with default test data
 * Only available in test environments
 */
export function setupTestEnvironment(): TestUserProject {
    // Clear any existing data first
    clearTestData();

    // Create and return new test data
    return createTestUserData();
}

/**
 * Manual login helper for testing
 * Only available in test environments
 */
export async function performTestLogin(): Promise<void> {
    try {
        const userManager = (window as unknown as {
            __USER_MANAGER__: { loginWithEmailPassword: (e: string, p: string) => Promise<void>; };
        }).__USER_MANAGER__;
        if (userManager && userManager.loginWithEmailPassword) {
            await userManager.loginWithEmailPassword("test@example.com", "password");
            logger.debug("Manual test login successful");
        } else {
            throw new Error("UserManager not available");
        }
    } catch (err) {
        logger.error({ error: err }, "Manual test login failed:");
        throw err;
    }
}

/**
 * Debug information logger for testing
 * Only available in test environments
 */
export function logDebugInfo(): void {
    logger.debug("=== Test Debug Info ===");
    logger.debug(
        "Current user:",
        (window as unknown as { __USER_MANAGER__?: { getCurrentUser: () => unknown; }; }).__USER_MANAGER__
            ?.getCurrentUser(),
    );
    logger.debug(
        "Auth state:",
        (window as unknown as { __USER_MANAGER__?: { auth?: { currentUser: unknown; }; }; }).__USER_MANAGER__?.auth
            ?.currentUser,
    );
    logger.debug("Firestore userProject:", firestoreStore.userProject);
    logger.debug("======================");
}

// Export test utilities for global access in test environments only
