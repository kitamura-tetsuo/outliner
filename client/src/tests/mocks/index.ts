// filepath: /workspace/client/src/tests/mocks/index.ts
import { vi } from "vitest";
import * as UserManagerModule from "../../auth/UserManager";
import { resetMockFirestore, setupMockFirestore } from "./firestoreMock";

// Mock for UserManager
const mockUserManager = {
    getCurrentUser: vi.fn().mockReturnValue({
        id: "test-user-id",
        name: "Test User",
        email: "test@example.com",
    }),
    addEventListener: vi.fn().mockImplementation(callback => {
        // Simulate auth state change notification
        callback({
            user: {
                id: "test-user-id",
                name: "Test User",
                email: "test@example.com",
            },
        });
        return vi.fn(); // Return mock unsubscribe function
    }),
    auth: {
        currentUser: {
            getIdToken: vi.fn().mockResolvedValue("mock-id-token"),
        },
    },
};

// Setup all mocks at once
export function setupMocks({
    firestore = {},
} = {}) {
    // Mock userManager instance
    vi.spyOn(UserManagerModule, "userManager", "get").mockReturnValue(mockUserManager as unknown);

    // Setup Firestore mock with optional initial data
    setupMockFirestore(firestore);

    // Mock fetch for API calls
    const originalFetch = global.fetch;
    global.fetch = vi.fn().mockImplementation((url, options) => {
        if (url.includes("/api/save-container")) {
            return Promise.resolve({
                ok: true,
                status: 200,
                json: () => Promise.resolve({ success: true }),
            });
        }

        // Fall back to original implementation for unhandled requests
        return originalFetch(url, options);
    });

    // Return control functions for tests
    return {
        getUserManager: () => mockUserManager,
        resetFirestore: resetMockFirestore,
        resetAll: () => {
            resetMockFirestore();
            vi.clearAllMocks();
            global.fetch = originalFetch;
        },
    };
}

// Export all individual mock modules for direct access
export * from "./firestoreMock";
