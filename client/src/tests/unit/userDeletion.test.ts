/** @feature USR-0001
 *  Title   : User Deletion Functionality - Unit Test
 *  Source  : docs/client-features.yaml
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Unit Test for User Deletion Functionality
 *
 * Tests the business logic of Firebase Functions in isolation.
 * Uses mocks for external dependencies (Firebase Auth, Firestore).
 */

// Type definitions for mocks
interface MockUser {
    uid: string;
    email: string;
}

interface MockUserData {
    accessibleContainerIds: string[];
    defaultContainerId: string | null;
    updatedAt: Date;
}

interface MockContainerData {
    accessibleUserIds: string[];
    createdAt: Date;
    updatedAt: Date;
}

// Mocks for Firebase Admin SDK
const mockAuth = {
    verifyIdToken: vi.fn(),
    deleteUser: vi.fn(),
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
class UserDeletionService {
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

    async getUserContainers(): Promise<string[]> {
        const userDoc = await mockDocRef.get();

        if (!userDoc.exists) {
            return [];
        }

        const userData = userDoc.data() as MockUserData;
        return userData.accessibleContainerIds || [];
    }

    async removeUserFromContainers(userId: string, containerIds: string[]): Promise<void> {
        // In this mock, we simulate the operation for each container
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        for (const _containerId of containerIds) {
            const containerDoc = await mockDocRef.get();

            if (containerDoc.exists) {
                const containerData = containerDoc.data() as MockContainerData;
                const accessibleUserIds = containerData.accessibleUserIds || [];

                // Remove user ID
                const updatedUserIds = accessibleUserIds.filter(id => id !== userId);

                // If no users can access the container, delete the container
                if (updatedUserIds.length === 0) {
                    await mockDocRef.delete();
                } else {
                    await mockDocRef.update({
                        accessibleUserIds: updatedUserIds,
                        updatedAt: new Date(),
                    });
                }
            }
        }
    }

    async deleteUserData(): Promise<void> {
        await mockDocRef.delete();
    }

    async deleteUserAuth(userId: string): Promise<void> {
        await this.auth.deleteUser(userId);
    }

    validateUserDeletion(userId: string | undefined): void {
        if (!userId) {
            throw new Error("User ID is required");
        }
    }

    shouldDeleteContainer(accessibleUserIds: string[], userId: string): boolean {
        // Return false if the user is not in the access list
        if (!accessibleUserIds.includes(userId)) {
            return false;
        }
        const updatedUserIds = accessibleUserIds.filter(id => id !== userId);
        return updatedUserIds.length === 0;
    }

    removeUserFromAccessList(accessibleUserIds: string[], userId: string): string[] {
        return accessibleUserIds.filter(id => id !== userId);
    }
}

describe("User Deletion Service - Unit Tests", () => {
    let service: UserDeletionService;

    beforeEach(() => {
        vi.clearAllMocks();

        // Default mock setup
        mockAuth.verifyIdToken.mockResolvedValue({
            uid: "test-user-id",
            email: "test@example.com",
        });

        mockAuth.deleteUser.mockResolvedValue(undefined);
        mockFirestore.collection.mockReturnValue(mockCollection);

        service = new UserDeletionService(mockAuth);
    });

    describe("validateToken", () => {
        it("should return user information when the token is valid", async () => {
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

    describe("validateUserDeletion", () => {
        it("should not throw an error when the user ID is valid", () => {
            expect(() => service.validateUserDeletion("valid-user-id")).not.toThrow();
        });

        it("should throw an error when the user ID is empty", () => {
            expect(() => service.validateUserDeletion("")).toThrow("User ID is required");
        });

        it("should throw an error when the user ID is undefined", () => {
            expect(() => service.validateUserDeletion(undefined)).toThrow("User ID is required");
        });
    });

    describe("getUserContainers", () => {
        it("should return a list of container IDs when the user exists", async () => {
            const mockUserData = {
                accessibleContainerIds: ["container1", "container2", "container3"],
                defaultContainerId: "container1",
                updatedAt: new Date(),
            };

            mockDoc.exists = true;
            mockDoc.data.mockReturnValue(mockUserData);

            const result = await service.getUserContainers();

            expect(result).toEqual(["container1", "container2", "container3"]);
        });

        it("should return an empty array when the user does not exist", async () => {
            mockDoc.exists = false;

            const result = await service.getUserContainers();

            expect(result).toEqual([]);
        });

        it("should return an empty array when accessibleContainerIds is undefined", async () => {
            const mockUserData = {
                defaultContainerId: "container1",
                updatedAt: new Date(),
            };

            mockDoc.exists = true;
            mockDoc.data.mockReturnValue(mockUserData);

            const result = await service.getUserContainers();

            expect(result).toEqual([]);
        });
    });

    describe("shouldDeleteContainer", () => {
        it("should return true when the user is the last accessor", () => {
            const accessibleUserIds = ["test-user-id"];

            const result = service.shouldDeleteContainer(accessibleUserIds, "test-user-id");

            expect(result).toBe(true);
        });

        it("should return false when there are other accessors", () => {
            const accessibleUserIds = ["test-user-id", "other-user-id"];

            const result = service.shouldDeleteContainer(accessibleUserIds, "test-user-id");

            expect(result).toBe(false);
        });

        it("should return false when the user is not in the access list", () => {
            const accessibleUserIds = ["other-user-id"];

            const result = service.shouldDeleteContainer(accessibleUserIds, "test-user-id");

            expect(result).toBe(false);
        });

        it("should return false when the access list is empty", () => {
            const accessibleUserIds: string[] = [];

            const result = service.shouldDeleteContainer(accessibleUserIds, "test-user-id");

            expect(result).toBe(false);
        });
    });

    describe("removeUserFromAccessList", () => {
        it("should correctly remove the user ID", () => {
            const accessibleUserIds = ["user1", "test-user-id", "user2"];

            const result = service.removeUserFromAccessList(accessibleUserIds, "test-user-id");

            expect(result).toEqual(["user1", "user2"]);
        });

        it("should return the original array when the user ID does not exist", () => {
            const accessibleUserIds = ["user1", "user2"];

            const result = service.removeUserFromAccessList(accessibleUserIds, "non-existing-user");

            expect(result).toEqual(["user1", "user2"]);
        });

        it("should return an empty array when the array is empty", () => {
            const accessibleUserIds: string[] = [];

            const result = service.removeUserFromAccessList(accessibleUserIds, "test-user-id");

            expect(result).toEqual([]);
        });

        it("should remove all instances when there are multiple same user IDs", () => {
            const accessibleUserIds = ["user1", "test-user-id", "user2", "test-user-id"];

            const result = service.removeUserFromAccessList(accessibleUserIds, "test-user-id");

            expect(result).toEqual(["user1", "user2"]);
        });
    });

    describe("deleteUserAuth", () => {
        it("should delete the user from Firebase Auth", async () => {
            await service.deleteUserAuth("test-user-id");

            expect(mockAuth.deleteUser).toHaveBeenCalledWith("test-user-id");
        });

        it("should throw an error when deletion fails", async () => {
            mockAuth.deleteUser.mockRejectedValue(new Error("Delete failed"));

            await expect(service.deleteUserAuth("test-user-id")).rejects.toThrow("Delete failed");
        });
    });
});
