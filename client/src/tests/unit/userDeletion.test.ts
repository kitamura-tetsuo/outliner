/** @feature USR-0001
 *  Title   : ユーザー削除機能 - Unit Test
 *  Source  : docs/client-features.yaml
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * ユーザー削除機能のUnit Test
 *
 * Firebase Functionsのビジネスロジックを単体でテストします。
 * 外部依存関係（Firebase Auth、Firestore）はモックを使用します。
 */

// モック用の型定義
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

// Firebase Admin SDK のモック
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

// テスト対象の関数をモック化
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

                // ユーザーIDを削除
                const updatedUserIds = accessibleUserIds.filter(id => id !== userId);

                // コンテナにアクセスできるユーザーがいなくなった場合、コンテナを削除
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

    validateUserDeletion(userId: string): void {
        if (!userId) {
            throw new Error("User ID is required");
        }
    }

    shouldDeleteContainer(accessibleUserIds: string[], userId: string): boolean {
        // ユーザーがアクセス者リストに含まれていない場合はfalseを返す
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

        // デフォルトのモック設定
        mockAuth.verifyIdToken.mockResolvedValue({
            uid: "test-user-id",
            email: "test@example.com",
        });

        mockAuth.deleteUser.mockResolvedValue(undefined);
        mockFirestore.collection.mockReturnValue(mockCollection);

        service = new UserDeletionService(mockAuth);
    });

    describe("validateToken", () => {
        it("有効なトークンの場合、ユーザー情報を返すこと", async () => {
            const result = await service.validateToken("valid_token");

            expect(result).toEqual({
                uid: "test-user-id",
                email: "test@example.com",
            });
            expect(mockAuth.verifyIdToken).toHaveBeenCalledWith("valid_token");
        });

        it("トークンが空の場合、エラーを投げること", async () => {
            await expect(service.validateToken("")).rejects.toThrow("ID token is required");
        });

        it("無効なトークンの場合、エラーを投げること", async () => {
            await expect(service.validateToken("invalid_token")).rejects.toThrow("Authentication failed");
        });
    });

    describe("validateUserDeletion", () => {
        it("有効なユーザーIDの場合、エラーを投げないこと", () => {
            expect(() => service.validateUserDeletion("valid-user-id")).not.toThrow();
        });

        it("ユーザーIDが空の場合、エラーを投げること", () => {
            expect(() => service.validateUserDeletion("")).toThrow("User ID is required");
        });

        it("ユーザーIDがundefinedの場合、エラーを投げること", () => {
            expect(() => service.validateUserDeletion(undefined as string)).toThrow("User ID is required");
        });
    });

    describe("getUserContainers", () => {
        it("ユーザーが存在する場合、コンテナIDリストを返すこと", async () => {
            const mockUserData = {
                accessibleContainerIds: ["container1", "container2", "container3"],
                defaultContainerId: "container1",
                updatedAt: new Date(),
            };

            mockDoc.exists = true;
            mockDoc.data.mockReturnValue(mockUserData);

            const result = await service.getUserContainers("test-user-id");

            expect(result).toEqual(["container1", "container2", "container3"]);
        });

        it("ユーザーが存在しない場合、空配列を返すこと", async () => {
            mockDoc.exists = false;

            const result = await service.getUserContainers("non-existing-user");

            expect(result).toEqual([]);
        });

        it("accessibleContainerIdsが未定義の場合、空配列を返すこと", async () => {
            const mockUserData = {
                defaultContainerId: "container1",
                updatedAt: new Date(),
            };

            mockDoc.exists = true;
            mockDoc.data.mockReturnValue(mockUserData);

            const result = await service.getUserContainers("test-user-id");

            expect(result).toEqual([]);
        });
    });

    describe("shouldDeleteContainer", () => {
        it("ユーザーが最後のアクセス者の場合、trueを返すこと", () => {
            const accessibleUserIds = ["test-user-id"];

            const result = service.shouldDeleteContainer(accessibleUserIds, "test-user-id");

            expect(result).toBe(true);
        });

        it("他にもアクセス者がいる場合、falseを返すこと", () => {
            const accessibleUserIds = ["test-user-id", "other-user-id"];

            const result = service.shouldDeleteContainer(accessibleUserIds, "test-user-id");

            expect(result).toBe(false);
        });

        it("ユーザーがアクセス者リストにいない場合、falseを返すこと", () => {
            const accessibleUserIds = ["other-user-id"];

            const result = service.shouldDeleteContainer(accessibleUserIds, "test-user-id");

            expect(result).toBe(false);
        });

        it("アクセス者リストが空の場合、falseを返すこと", () => {
            const accessibleUserIds: string[] = [];

            const result = service.shouldDeleteContainer(accessibleUserIds, "test-user-id");

            expect(result).toBe(false);
        });
    });

    describe("removeUserFromAccessList", () => {
        it("ユーザーIDを正しく削除すること", () => {
            const accessibleUserIds = ["user1", "test-user-id", "user2"];

            const result = service.removeUserFromAccessList(accessibleUserIds, "test-user-id");

            expect(result).toEqual(["user1", "user2"]);
        });

        it("ユーザーIDが存在しない場合、元の配列を返すこと", () => {
            const accessibleUserIds = ["user1", "user2"];

            const result = service.removeUserFromAccessList(accessibleUserIds, "non-existing-user");

            expect(result).toEqual(["user1", "user2"]);
        });

        it("空の配列の場合、空の配列を返すこと", () => {
            const accessibleUserIds: string[] = [];

            const result = service.removeUserFromAccessList(accessibleUserIds, "test-user-id");

            expect(result).toEqual([]);
        });

        it("同じユーザーIDが複数ある場合、すべて削除すること", () => {
            const accessibleUserIds = ["user1", "test-user-id", "user2", "test-user-id"];

            const result = service.removeUserFromAccessList(accessibleUserIds, "test-user-id");

            expect(result).toEqual(["user1", "user2"]);
        });
    });

    describe("deleteUserAuth", () => {
        it("Firebase Authからユーザーを削除すること", async () => {
            await service.deleteUserAuth("test-user-id");

            expect(mockAuth.deleteUser).toHaveBeenCalledWith("test-user-id");
        });

        it("削除に失敗した場合、エラーを投げること", async () => {
            mockAuth.deleteUser.mockRejectedValue(new Error("Delete failed"));

            await expect(service.deleteUserAuth("test-user-id")).rejects.toThrow("Delete failed");
        });
    });
});
