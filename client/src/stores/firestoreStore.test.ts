import { beforeEach, describe, expect, it } from "vitest";
import { clearTestData, setupTestEnvironment } from "../tests/utils/testDataHelper";
import { firestoreStore } from "./firestoreStore.svelte";

describe("firestoreStore", () => {
    beforeEach(() => {
        // Clear any existing test data before each test
        clearTestData();
    });

    it("initial userContainer is null", () => {
        // In production, userContainer should start as null
        expect(firestoreStore.userContainer).toBeNull();
    });

    it("can set userContainer with test data", () => {
        // Use test helper to create test data
        const testData = setupTestEnvironment();

        expect(firestoreStore.userContainer).not.toBeNull();
        expect(firestoreStore.userContainer).toMatchObject({
            userId: "test-user-id",
            defaultContainerId: "test-container-1",
            accessibleContainerIds: ["test-container-1", "test-container-2"],
        });
        expect(firestoreStore.userContainer).toEqual(testData);
    });

    it("can clear userContainer", () => {
        // Set test data first
        setupTestEnvironment();
        expect(firestoreStore.userContainer).not.toBeNull();

        // Clear test data
        clearTestData();
        expect(firestoreStore.userContainer).toBeNull();
    });
});
