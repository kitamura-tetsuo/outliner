// filepath: /workspace/client/src/tests/mocks/index.ts
import { setupMockFirestore, resetMockFirestore } from './firestoreMock';
import { UserManager } from '../../auth/UserManager';

// Mock for UserManager
const mockUserManager = {
    getCurrentUser: jest.fn().mockReturnValue({
        id: 'test-user-id',
        name: 'Test User',
        email: 'test@example.com'
    }),
    addEventListener: jest.fn().mockImplementation((callback) => {
        // Simulate auth state change notification
        callback({
            user: {
                id: 'test-user-id',
                name: 'Test User',
                email: 'test@example.com'
            }
        });
        return jest.fn(); // Return mock unsubscribe function
    }),
    auth: {
        currentUser: {
            getIdToken: jest.fn().mockResolvedValue('mock-id-token')
        }
    }
};

// Setup all mocks at once
export function setupMocks({
    firebase = {},
    firestore = {}
} = {}) {
    // Mock UserManager singleton
    jest.spyOn(UserManager, 'getInstance').mockReturnValue(mockUserManager as any);

    // Setup Firestore mock with optional initial data
    setupMockFirestore(firestore);

    // Mock fetch for API calls
    const originalFetch = global.fetch;
    global.fetch = jest.fn().mockImplementation((url, options) => {
        if (url.includes('/api/save-container')) {
            return Promise.resolve({
                ok: true,
                status: 200,
                json: () => Promise.resolve({ success: true })
            });
        }

        if (url.includes('/api/fluid-token')) {
            return Promise.resolve({
                ok: true,
                status: 200,
                json: () => Promise.resolve({
                    token: 'mock-fluid-token',
                    user: { id: 'test-user-id', name: 'Test User' }
                })
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
            jest.clearAllMocks();
            global.fetch = originalFetch;
        }
    };
}

// Export all individual mock modules for direct access
export * from './firestoreMock';