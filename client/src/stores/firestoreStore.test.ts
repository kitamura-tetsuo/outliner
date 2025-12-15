import { beforeEach, describe, expect, it } from "vitest";
import { clearTestData, setupTestEnvironment } from "../tests/utils/testDataHelper";
import { firestoreStore } from "./firestoreStore.svelte";

describe("firestoreStore", () => {
    beforeEach(() => {
        // Clear any existing test data before each test
        clearTestData();
    });

    it("initial userProject is null", () => {
        // In production, userProject should start as null
        expect(firestoreStore.userProject).toBeNull();
    });

    it("can set userProject with test data", () => {
        // Use test helper to create test data
        const testData = setupTestEnvironment();

        expect(firestoreStore.userProject).not.toBeNull();
        expect(firestoreStore.userProject).toMatchObject({
            userId: "test-user-id",
            defaultProjectId: "test-project-1",
            accessibleProjectIds: ["test-project-1", "test-project-2"],
        });
        expect(firestoreStore.userProject).toEqual(testData);
    });

    it("can clear userProject", () => {
        // Set test data first
        setupTestEnvironment();
        expect(firestoreStore.userProject).not.toBeNull();

        // Clear test data
        clearTestData();
        expect(firestoreStore.userProject).toBeNull();
    });
});
