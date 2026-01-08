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
    (firestoreStore as any).setUserProject(testUserProject as any);

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
        const userManager = (window as any).__USER_MANAGER__;
        if (userManager && userManager.loginWithEmailPassword) {
            await userManager.loginWithEmailPassword("test@example.com", "password");
            console.log("Manual test login successful");
        } else {
            throw new Error("UserManager not available");
        }
    } catch (err) {
        console.error("Manual test login failed:", err);
        throw err;
    }
}

/**
 * Debug information logger for testing
 * Only available in test environments
 */
export function logDebugInfo(): void {
    console.log("=== Test Debug Info ===");
    console.log("Current user:", (window as any).__USER_MANAGER__?.getCurrentUser());
    console.log("Auth state:", (window as any).__USER_MANAGER__?.auth?.currentUser);
    console.log("Firestore userProject:", firestoreStore.userProject);
    console.log("======================");
}

// Export test utilities for global access in test environments only
