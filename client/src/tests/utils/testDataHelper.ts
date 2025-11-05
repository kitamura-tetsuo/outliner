import { firestoreStore } from "../../stores/firestoreStore.svelte";

/**
 * Test data helper functions for test environments only
 * These functions should never be used in production code
 */

export interface TestUserContainer {
    userId: string;
    defaultContainerId: string;
    accessibleContainerIds: string[];
    createdAt: Date;
    updatedAt: Date;
}

/**
 * Creates test user data for testing purposes
 * Only available in test environments
 */
export function createTestUserData(): TestUserContainer {
    const testUserContainer: TestUserContainer = {
        userId: "test-user-id",
        defaultContainerId: "test-container-1",
        accessibleContainerIds: ["test-container-1", "test-container-2"],
        createdAt: new Date(),
        updatedAt: new Date(),
    };

    // Set test data in firestoreStore using public API to ensure reactivity wrapping
    firestoreStore.setUserContainer(testUserContainer);

    return testUserContainer;
}

/**
 * Clears all test data
 * Only available in test environments
 */
export function clearTestData(): void {
    firestoreStore.userContainer = null;
}

/**
 * Sets up test environment with default test data
 * Only available in test environments
 */
export function setupTestEnvironment(): TestUserContainer {
    // Clear unknown existing data first
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
        const userManager = window.__USER_MANAGER__;
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
    console.log("Current user:", window.__USER_MANAGER__?.getCurrentUser());
    console.log("Auth state:", window.__USER_MANAGER__?.auth?.currentUser);
    console.log("Firestore userContainer:", firestoreStore.userContainer);
    console.log("======================");
}

// Export test utilities for global access in test environments only
if (typeof window !== "undefined") {
    const isTestEnv = import.meta.env.MODE === "test"
        || import.meta.env.VITE_IS_TEST === "true"
        || process.env.NODE_ENV === "test"
        || window.location.hostname === "localhost";

    if (isTestEnv) {
        window.__TEST_DATA_HELPER__ = {
            createTestUserData,
            clearTestData,
            setupTestEnvironment,
            performTestLogin,
            logDebugInfo,
        };
        console.log("Test data helper registered globally");
    }
}
