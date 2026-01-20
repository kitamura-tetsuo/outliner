// filepath: /workspace/client/src/tests/mocks/firestoreMock.ts
import { get, type Writable, writable } from "svelte/store";
import { log } from "../../lib/logger"; // ロガーをインポート

// Mock version of UserProject from the real store
export interface UserProject {
    userId: string;
    defaultProjectId: string | null;
    accessibleProjectIds: Array<string>;
    createdAt: Date;
    updatedAt: Date;
}

// Mock user project store
export const mockUserContainer: Writable<UserProject | null> = writable(null);

// Mock unsubscribe function
let mockUnsubscribe: (() => void) | null = null;

// Mock user containers data for testing
const mockContainers: Map<string, UserProject> = new Map();

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
        const containerData: UserProject = {
            userId: userId,
            defaultProjectId: initialData.defaultContainerId || null,
            accessibleProjectIds: initialData.accessibleContainerIds || [],
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
    const projectData = mockContainers.get(currentUserId);
    if (projectData) {
        mockUserContainer.set(projectData);
        log("firestoreMock", "debug", `[MOCK] Loaded project data for user ${currentUserId}`);
    } else {
        mockUserContainer.set(null);
        log("firestoreMock", "debug", `[MOCK] No project data found for user ${currentUserId}`);
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
        defaultProjectId: null,
        accessibleProjectIds: [],
        createdAt: new Date(),
        updatedAt: new Date(),
    };

    const updatedData = {
        ...existingData,
        defaultProjectId: containerId,
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
        defaultProjectId: null,
        accessibleProjectIds: [],
        createdAt: new Date(),
        updatedAt: new Date(),
    };

    const updatedData = {
        ...existingData,
        defaultProjectId: containerId,
        accessibleProjectIds: existingData.accessibleProjectIds
            ? [...new Set([...existingData.accessibleProjectIds, containerId])]
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
    const projectData = get(mockUserContainer);
    if (projectData?.defaultProjectId) {
        return projectData.defaultProjectId;
    }

    // Then try from mock "database"
    const userId = "test-user-id";
    const storedData = mockContainers.get(userId);
    return storedData?.defaultProjectId || null;
}

// Mock getUserContainers function
export async function mockGetUserContainers(): Promise<{ id: string; name?: string; isDefault?: boolean; }[]> {
    if (mockApiErrors) {
        throw new Error("[MOCK] API error occurred");
    }

    // Try from store first
    const projectData = get(mockUserContainer);
    if (projectData) {
        return buildContainersList(projectData);
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
function buildContainersList(data: UserProject): { id: string; name?: string; isDefault?: boolean; }[] {
    const containers = [];

    // Add default container if exists
    if (data.defaultProjectId) {
        containers.push({
            id: data.defaultProjectId,
            name: "デフォルトコンテナ",
            isDefault: true,
        });
    }

    // Add other accessible containers
    if (data.accessibleProjectIds && data.accessibleProjectIds.length > 0) {
        const additionalContainers = data.accessibleProjectIds
            .filter(id => id !== data.defaultProjectId)
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
