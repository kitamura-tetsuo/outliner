// filepath: /workspace/client/src/tests/mocks/index.ts
import { vi } from "vitest";
import * as UserManagerModule from "../../auth/UserManager";
import { resetMockFirestore, setupMockFirestore } from "./firestoreMock";

// Import IUser type from UserManager
import type { IUser } from "../../auth/UserManager";

// Type alias for RequestInit in test environment
type FetchOptions = {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
    [key: string]: unknown;
};

// Mock interface that matches the parts of UserManager used in tests
interface MockUserManager {
    getCurrentUser: () => IUser | null;
    addEventListener: (listener: (result: { user: IUser; } | null) => void) => () => void;
    auth: {
        currentUser: {
            getIdToken: () => Promise<string>;
        } | null;
    };
}

// Mock for UserManager
const mockUserManager: {
    getCurrentUser: () => { id: string; name: string; email: string; };
    addEventListener: (
        callback: (event: { user: { id: string; name: string; email: string; }; }) => void,
    ) => () => void;
    auth: {
        currentUser: {
            getIdToken: () => Promise<string>;
        };
    };
} = {
    getCurrentUser: vi.fn().mockReturnValue({
        id: "test-user-id",
        name: "Test User",
        email: "test@example.com",
    }),
    addEventListener: vi.fn().mockImplementation((callback) => {
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
} as MockUserManager;

// Setup all mocks at once
export function setupMocks({
    firestore = {},
}: {
    firestore?: {
        userId?: string;
        defaultContainerId?: string;
        accessibleContainerIds?: string[];
    };
} = {}) {
    // Mock userManager instance
    vi.spyOn(UserManagerModule, "userManager", "get").mockReturnValue(
        mockUserManager as unknown as UserManagerModule.UserManager,
    );

    // Setup Firestore mock with optional initial data
    setupMockFirestore(firestore);

    // Mock fetch for API calls
    const originalFetch = global.fetch;
    global.fetch = vi.fn().mockImplementation((url: string, options?: FetchOptions) => {
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
