// filepath: /workspace/client/src/tests/mocks/firestoreMock.ts
import { get, type Writable, writable } from "svelte/store";
import { log } from "../../lib/logger"; // ロガーをインポート

// Mock version of UserContainer from the real store
export interface UserContainer {
    userId: string;
    defaultContainerId?: string;
    accessibleContainerIds?: string[];
    createdAt: Date;
    updatedAt: Date;
}

// Mock user container store
export const mockUserContainer: Writable<UserContainer | null> = writable(null);

// Mock unsubscribe function
let mockUnsubscribe: (() => void) | null = null;

// Mock user containers data for testing
const mockContainers: Map<string, UserContainer> = new Map();

// Setup initial mock data
export function setupMockFirestore(initialData?: {
    userId?: string;
    defaultContainerId?: string;
    accessibleContainerIds?: string[];
}) {
    // Clear previous mock data
    mockContainers.clear();

    if (initialData) {
        const userId = initialData.userId || "test-user-id";
        const containerData: UserContainer = {
            userId: userId,
            defaultContainerId: initialData.defaultContainerId,
            accessibleContainerIds: initialData.accessibleContainerIds || [],
            createdAt: new Date(),
            updatedAt: new Date(),
        };

        mockContainers.set(userId, containerData);
        mockUserContainer.set(containerData);
    } else {
        mockUserContainer.set(null);
    }

    // Mock API responses
    mockSaveContainerIdResponse = { success: true };
    mockApiErrors = false;
}

// Mock API response for saveContainerId
let mockSaveContainerIdResponse: { success: boolean; } = { success: true };
let mockApiErrors = false;

// Set API response behavior
export function setMockApiResponse(success: boolean) {
    mockSaveContainerIdResponse = { success };
}

// Set if API calls should throw errors
export function setMockApiErrors(shouldError: boolean) {
    mockApiErrors = shouldError;
}

// Mock initFirestoreSync function
export function mockInitFirestoreSync(): () => void {
    const currentUserId = "test-user-id"; // Default mock user ID

    if (mockUnsubscribe) {
        mockUnsubscribe();
        mockUnsubscribe = null;
    }

    // Simulate Firestore snapshot listener
    const containerData = mockContainers.get(currentUserId);
    if (containerData) {
        mockUserContainer.set(containerData);
        log("firestoreMock", "debug", `[MOCK] Loaded container data for user ${currentUserId}`);
    } else {
        mockUserContainer.set(null);
        log("firestoreMock", "debug", `[MOCK] No container data found for user ${currentUserId}`);
    }

    // Create a mock unsubscribe function
    mockUnsubscribe = () => {
        log("firestoreMock", "debug", "[MOCK] Unsubscribed from Firestore");
    };

    return mockUnsubscribe;
}

// Mock saveContainerId function
export async function mockSaveContainerId(containerId: string): Promise<boolean> {
    if (mockApiErrors) {
        throw new Error("[MOCK] API error occurred");
    }

    const userId = "test-user-id";
    const existingData = mockContainers.get(userId) || {
        userId,
        accessibleContainerIds: [],
        createdAt: new Date(),
        updatedAt: new Date(),
    };

    const updatedData = {
        ...existingData,
        defaultContainerId: containerId,
        updatedAt: new Date(),
    };

    mockContainers.set(userId, updatedData);
    mockUserContainer.set(updatedData);

    return mockSaveContainerIdResponse.success;
}

// Mock saveContainerIdToServer function
export async function mockSaveContainerIdToServer(containerId: string): Promise<boolean> {
    if (mockApiErrors) {
        throw new Error("[MOCK] API error occurred");
    }

    const userId = "test-user-id";
    const existingData = mockContainers.get(userId) || {
        userId,
        accessibleContainerIds: [],
        createdAt: new Date(),
        updatedAt: new Date(),
    };

    const updatedData = {
        ...existingData,
        defaultContainerId: containerId,
        accessibleContainerIds: existingData.accessibleContainerIds
            ? [...new Set([...existingData.accessibleContainerIds, containerId])]
            : [containerId],
        updatedAt: new Date(),
    };

    mockContainers.set(userId, updatedData);
    mockUserContainer.set(updatedData);

    // ローカルストレージにも現在のコンテナIDを保存
    if (typeof window !== "undefined") {
        window.localStorage.setItem("currentContainerId", containerId);
    }

    return mockSaveContainerIdResponse.success;
}

// Mock getDefaultContainerId function
export async function mockGetDefaultContainerId(): Promise<string | null> {
    if (mockApiErrors) {
        throw new Error("[MOCK] API error occurred");
    }

    // Try from store first
    const containerData = get(mockUserContainer);
    if (containerData?.defaultContainerId) {
        return containerData.defaultContainerId;
    }

    // Then try from mock "database"
    const userId = "test-user-id";
    const storedData = mockContainers.get(userId);
    return storedData?.defaultContainerId || null;
}

// Mock getUserContainers function
export async function mockGetUserContainers(): Promise<{ id: string; name?: string; isDefault?: boolean; }[]> {
    if (mockApiErrors) {
        throw new Error("[MOCK] API error occurred");
    }

    // Try from store first
    const containerData = get(mockUserContainer);
    if (containerData) {
        return buildContainersList(containerData);
    }

    // Then try from mock "database"
    const userId = "test-user-id";
    const storedData = mockContainers.get(userId);
    if (storedData) {
        return buildContainersList(storedData);
    }

    return [];
}

// Helper function to build containers list
function buildContainersList(data: UserContainer): { id: string; name?: string; isDefault?: boolean; }[] {
    const containers = [];

    // Add default container if exists
    if (data.defaultContainerId) {
        containers.push({
            id: data.defaultContainerId,
            name: "デフォルトコンテナ",
            isDefault: true,
        });
    }

    // Add other accessible containers
    if (data.accessibleContainerIds && data.accessibleContainerIds.length > 0) {
        const additionalContainers = data.accessibleContainerIds
            .filter(id => id !== data.defaultContainerId)
            .map(id => ({
                id,
                name: `コンテナ ${id.substring(0, 8)}...`,
                isDefault: false,
            }));

        containers.push(...additionalContainers);
    }

    return containers;
}

// Reset all mocks to initial state
export function resetMockFirestore() {
    mockContainers.clear();
    mockUserContainer.set(null);
    if (mockUnsubscribe) {
        mockUnsubscribe();
        mockUnsubscribe = null;
    }
    mockSaveContainerIdResponse = { success: true };
    mockApiErrors = false;
}
