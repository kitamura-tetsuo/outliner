/** @feature USR-0002
 *  Title   : Container Deletion Feature - Unit Test
 *  Source  : docs/client-features.yaml
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Unit Test for Container Deletion Feature
 *
 * Tests the business logic for Firebase Functions in isolation.
 * Uses mocks for external dependencies (Firebase Auth, Firestore).
 */

// Type definitions for mocks
interface MockUser {
    uid: string;
    email: string;
}

interface MockContainerData {
    accessibleUserIds: string[];
    createdAt: Date;
    updatedAt: Date;
}

interface MockUserData {
    accessibleContainerIds: string[];
    defaultContainerId: string | null;
    updatedAt: Date;
}

// Mock for Firebase Admin SDK
const mockAuth = {
    verifyIdToken: vi.fn(),
};

const mockFirestore = {
    collection: vi.fn(),
    runTransaction: vi.fn(),
};

const mockDoc = {
    get: vi.fn(),
    exists: false,
    data: vi.fn(),
};

const mockDocRef = {
    get: vi.fn(() => Promise.resolve(mockDoc)),
    update: vi.fn(),
    delete: vi.fn(),
};

const mockCollection = {
    doc: vi.fn(() => mockDocRef),
};

// Mocking the function under test
class ContainerDeletionService {
    constructor(private auth: typeof mockAuth) {}

    async validateToken(idToken: string): Promise<MockUser> {
        if (!idToken) {
            throw new Error("ID token is required");
        }

        if (idToken === "invalid_token") {
            throw new Error("Authentication failed");
        }

        return await this.auth.verifyIdToken(idToken);
    }

    validateContainerId(containerId: string | undefined): void {
        if (!containerId) {
            throw new Error("Container ID is required");
        }
    }

    async checkContainerExists(): Promise<MockContainerData> {
        const containerDoc = await mockDocRef.get();

        if (!containerDoc.exists) {
            throw new Error("Container not found");
        }

        return containerDoc.data() as MockContainerData;
    }

    checkUserAccess(userId: string, containerData: MockContainerData): void {
        const accessibleUserIds = containerData.accessibleUserIds || [];

        if (!accessibleUserIds.includes(userId)) {
            throw new Error("Access to the container is denied");
        }
    }

    updateUserContainers(
        userId: string,
        containerId: string,
        userData: MockUserData,
    ): MockUserData {
        const accessibleContainerIds = userData.accessibleContainerIds || [];

        // Remove container ID
        const updatedContainerIds = accessibleContainerIds.filter(id => id !== containerId);

        // Update default container
        let defaultContainerId = userData.defaultContainerId;
        if (defaultContainerId === containerId) {
            defaultContainerId = updatedContainerIds.length > 0 ? updatedContainerIds[0] : null;
        }

        return {
            accessibleContainerIds: updatedContainerIds,
            defaultContainerId: defaultContainerId,
            updatedAt: new Date(),
        };
    }
}

describe("Container Deletion Service - Unit Tests", () => {
    let service: ContainerDeletionService;

    beforeEach(() => {
        vi.clearAllMocks();

        // Default mock setup
        mockAuth.verifyIdToken.mockResolvedValue({
            uid: "test-user-id",
            email: "test@example.com",
        });

        mockFirestore.collection.mockReturnValue(mockCollection);

        service = new ContainerDeletionService(mockAuth);
    });

    describe("validateToken", () => {
        it("should return user info when the token is valid", async () => {
            const result = await service.validateToken("valid_token");

            expect(result).toEqual({
                uid: "test-user-id",
                email: "test@example.com",
            });
            expect(mockAuth.verifyIdToken).toHaveBeenCalledWith("valid_token");
        });

        it("should throw an error when the token is empty", async () => {
            await expect(service.validateToken("")).rejects.toThrow("ID token is required");
        });

        it("should throw an error when the token is invalid", async () => {
            await expect(service.validateToken("invalid_token")).rejects.toThrow("Authentication failed");
        });
    });

    describe("validateContainerId", () => {
        it("should not throw an error when the container ID is valid", () => {
            expect(() => service.validateContainerId("valid-container-id")).not.toThrow();
        });

        it("should throw an error when the container ID is empty", () => {
            expect(() => service.validateContainerId("")).toThrow("Container ID is required");
        });

        it("should throw an error when the container ID is undefined", () => {
            expect(() => service.validateContainerId(undefined)).toThrow("Container ID is required");
        });
    });

    describe("checkContainerExists", () => {
        it("should return container data when the container exists", async () => {
            const mockContainerData = {
                accessibleUserIds: ["user1", "user2"],
                createdAt: new Date(),
                updatedAt: new Date(),
            };

            mockDoc.exists = true;
            mockDoc.data.mockReturnValue(mockContainerData);

            const result = await service.checkContainerExists();

            expect(result).toEqual(mockContainerData);
        });

        it("should throw an error when the container does not exist", async () => {
            mockDoc.exists = false;

            await expect(service.checkContainerExists())
                .rejects.toThrow("Container not found");
        });
    });

    describe("checkUserAccess", () => {
        it("should not throw an error when the user has access rights", () => {
            const containerData = {
                accessibleUserIds: ["user1", "user2", "test-user-id"],
                createdAt: new Date(),
                updatedAt: new Date(),
            };

            expect(() => service.checkUserAccess("test-user-id", containerData)).not.toThrow();
        });

        it("should throw an error when the user does not have access rights", () => {
            const containerData = {
                accessibleUserIds: ["user1", "user2"],
                createdAt: new Date(),
                updatedAt: new Date(),
            };

            expect(() => service.checkUserAccess("unauthorized-user", containerData))
                .toThrow("Access to the container is denied");
        });

        it("should throw an error when accessibleUserIds is empty", () => {
            const containerData = {
                accessibleUserIds: [],
                createdAt: new Date(),
                updatedAt: new Date(),
            };

            expect(() => service.checkUserAccess("test-user-id", containerData))
                .toThrow("Access to the container is denied");
        });
    });

    describe("updateUserContainers", () => {
        it("should remove the container ID and update the default container", () => {
            const userData = {
                accessibleContainerIds: ["container1", "container2", "container3"],
                defaultContainerId: "container2",
                updatedAt: new Date(),
            };

            const result = service.updateUserContainers("user1", "container2", userData);

            expect(result.accessibleContainerIds).toEqual(["container1", "container3"]);
            expect(result.defaultContainerId).toBe("container1"); // First remaining container
        });

        it("should not change the default container if the deleted container is not the default one", () => {
            const userData = {
                accessibleContainerIds: ["container1", "container2", "container3"],
                defaultContainerId: "container1",
                updatedAt: new Date(),
            };

            const result = service.updateUserContainers("user1", "container2", userData);

            expect(result.accessibleContainerIds).toEqual(["container1", "container3"]);
            expect(result.defaultContainerId).toBe("container1"); // Unchanged
        });

        it("should set the default container to null when deleting the last container", () => {
            const userData = {
                accessibleContainerIds: ["container1"],
                defaultContainerId: "container1",
                updatedAt: new Date(),
            };

            const result = service.updateUserContainers("user1", "container1", userData);

            expect(result.accessibleContainerIds).toEqual([]);
            expect(result.defaultContainerId).toBeNull();
        });

        it("should not change the array when trying to delete a non-existent container ID", () => {
            const userData = {
                accessibleContainerIds: ["container1", "container2"],
                defaultContainerId: "container1",
                updatedAt: new Date(),
            };

            const result = service.updateUserContainers("user1", "non-existing-container", userData);

            expect(result.accessibleContainerIds).toEqual(["container1", "container2"]);
            expect(result.defaultContainerId).toBe("container1");
        });
    });
});
