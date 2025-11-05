// filepath: /workspace/client/src/tests/firestoreStore.test.ts
import { vi } from "vitest";

// Vi.js mocking setup
vi.mock("../stores/firestoreStore.svelte", async () => {
    const mockStore = await import("./mocks/mockFirestoreStore");
    return { ...mockStore };
});

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as firestoreStore from "../stores/firestoreStore.svelte";
import { setupMocks } from "./mocks";
import { setupMockFirestore } from "./mocks/firestoreMock";

describe("Firestore Store", () => {
    // Setup mock control functions
    const mocks = setupMocks({
        firestore: {
            userId: "test-user-id",
            defaultContainerId: "test-container-1",
            accessibleContainerIds: ["test-container-1", "test-container-2", "test-container-3"],
        },
    });

    beforeEach(() => {
        setupMockFirestore({
            userId: "test-user-id",
            defaultContainerId: "test-container-1",
            accessibleContainerIds: ["test-container-1", "test-container-2", "test-container-3"],
        });
    });

    afterEach(() => {
        // Clean up mocks after each test
        mocks.resetAll();
    });

    it("should provide container data through the store", () => {
        // Get the current value from the store
        const containerData = firestoreStore.firestoreStore.userContainer;

        expect(containerData).not.toBeNull();
        expect(containerData?.userId).toBe("test-user-id");
        expect(containerData?.defaultContainerId).toBe("test-container-1");
        expect(containerData?.accessibleContainerIds).toEqual([
            "test-container-1",
            "test-container-2",
            "test-container-3",
        ]);
    });

    it("should get default container ID", async () => {
        const containerId = await firestoreStore.getDefaultContainerId();

        expect(containerId).toBe("test-container-1");
    });

    it("should return a list of user containers", async () => {
        const containers = await firestoreStore.getUserContainers();

        expect(containers).toHaveLength(3);
        expect(containers[0].id).toBe("test-container-1");
        expect(containers[0].isDefault).toBe(true);
        expect(containers).toEqual(expect.arrayContaining([
            expect.objectContaining({ id: "test-container-1", isDefault: true }),
            expect.objectContaining({ id: "test-container-2", isDefault: false }),
            expect.objectContaining({ id: "test-container-3", isDefault: false }),
        ]));
    });

    it("should save container ID", async () => {
        const result = await firestoreStore.saveContainerId("new-container-id");

        expect(result).toBe(true);

        const containerId = await firestoreStore.getDefaultContainerId();
        expect(containerId).toBe("new-container-id");
    });
});
