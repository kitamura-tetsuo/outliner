// filepath: /workspace/client/src/tests/mocks/mockFirestoreStore.ts
import {
    mockGetDefaultContainerId,
    mockGetUserContainers,
    mockInitFirestoreSync,
    mockSaveContainerId,
    mockSaveContainerIdToServer,
    mockUserContainer,
} from "./firestoreMock";

// Export the mock store with the same interface as the real store
export const userContainer = mockUserContainer;
export const initFirestoreSync = mockInitFirestoreSync;
export const saveContainerId = mockSaveContainerId;
export const getDefaultContainerId = mockGetDefaultContainerId;
export const getUserContainers = mockGetUserContainers;
export const saveContainerIdToServer = mockSaveContainerIdToServer;

// Re-export types from the mock
export type { UserContainer } from "./firestoreMock";
