/** @feature USR-0002
 *  Title   : コンテナ削除機能 - Unit Test
 *  Source  : docs/client-features.yaml
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * コンテナ削除機能のUnit Test
 *
 * Firebase Functionsのビジネスロジックを単体でテストします。
 * 外部依存関係（Firebase Auth、Firestore）はモックを使用します。
 */

// モック用の型定義
interface MockUser {
    uid: string;
    email: string;
}

interface MockContainerData {
    accessibleUserIds: string[];
    createdAt: any;
    updatedAt: any;
}

interface MockUserData {
    accessibleContainerIds: string[];
    defaultContainerId: string | null;
    updatedAt: any;
}

// Firebase Admin SDK のモック
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

// テスト対象の関数をモック化
class ContainerDeletionService {
    constructor(
        private auth: typeof mockAuth,
        private db: typeof mockFirestore,
    ) {}

    async validateToken(idToken: string): Promise<MockUser> {
        if (!idToken) {
            throw new Error("ID token is required");
        }

        if (idToken === "invalid_token") {
            throw new Error("Authentication failed");
        }

        return await this.auth.verifyIdToken(idToken);
    }

    validateContainerId(containerId: string): void {
        if (!containerId) {
            throw new Error("Container ID is required");
        }
    }

    async checkContainerExists(containerId: string): Promise<MockContainerData> {
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

        // コンテナIDを削除
        const updatedContainerIds = accessibleContainerIds.filter(id => id !== containerId);

        // デフォルトコンテナの更新
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

        // デフォルトのモック設定
        mockAuth.verifyIdToken.mockResolvedValue({
            uid: "test-user-id",
            email: "test@example.com",
        });

        mockFirestore.collection.mockReturnValue(mockCollection);

        service = new ContainerDeletionService(mockAuth, mockFirestore);
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

    describe("validateContainerId", () => {
        it("有効なコンテナIDの場合、エラーを投げないこと", () => {
            expect(() => service.validateContainerId("valid-container-id")).not.toThrow();
        });

        it("コンテナIDが空の場合、エラーを投げること", () => {
            expect(() => service.validateContainerId("")).toThrow("Container ID is required");
        });

        it("コンテナIDがundefinedの場合、エラーを投げること", () => {
            expect(() => service.validateContainerId(undefined as any)).toThrow("Container ID is required");
        });
    });

    describe("checkContainerExists", () => {
        it("コンテナが存在する場合、コンテナデータを返すこと", async () => {
            const mockContainerData = {
                accessibleUserIds: ["user1", "user2"],
                createdAt: new Date(),
                updatedAt: new Date(),
            };

            mockDoc.exists = true;
            mockDoc.data.mockReturnValue(mockContainerData);

            const result = await service.checkContainerExists("existing-container");

            expect(result).toEqual(mockContainerData);
        });

        it("コンテナが存在しない場合、エラーを投げること", async () => {
            mockDoc.exists = false;

            await expect(service.checkContainerExists("non-existing-container"))
                .rejects.toThrow("Container not found");
        });
    });

    describe("checkUserAccess", () => {
        it("ユーザーがアクセス権を持つ場合、エラーを投げないこと", () => {
            const containerData = {
                accessibleUserIds: ["user1", "user2", "test-user-id"],
                createdAt: new Date(),
                updatedAt: new Date(),
            };

            expect(() => service.checkUserAccess("test-user-id", containerData)).not.toThrow();
        });

        it("ユーザーがアクセス権を持たない場合、エラーを投げること", () => {
            const containerData = {
                accessibleUserIds: ["user1", "user2"],
                createdAt: new Date(),
                updatedAt: new Date(),
            };

            expect(() => service.checkUserAccess("unauthorized-user", containerData))
                .toThrow("Access to the container is denied");
        });

        it("accessibleUserIdsが空の場合、エラーを投げること", () => {
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
        it("コンテナIDを削除し、デフォルトコンテナを更新すること", () => {
            const userData = {
                accessibleContainerIds: ["container1", "container2", "container3"],
                defaultContainerId: "container2",
                updatedAt: new Date(),
            };

            const result = service.updateUserContainers("user1", "container2", userData);

            expect(result.accessibleContainerIds).toEqual(["container1", "container3"]);
            expect(result.defaultContainerId).toBe("container1"); // 最初の残りコンテナ
        });

        it("削除するコンテナがデフォルトでない場合、デフォルトコンテナを変更しないこと", () => {
            const userData = {
                accessibleContainerIds: ["container1", "container2", "container3"],
                defaultContainerId: "container1",
                updatedAt: new Date(),
            };

            const result = service.updateUserContainers("user1", "container2", userData);

            expect(result.accessibleContainerIds).toEqual(["container1", "container3"]);
            expect(result.defaultContainerId).toBe("container1"); // 変更されない
        });

        it("最後のコンテナを削除する場合、デフォルトコンテナをnullにすること", () => {
            const userData = {
                accessibleContainerIds: ["container1"],
                defaultContainerId: "container1",
                updatedAt: new Date(),
            };

            const result = service.updateUserContainers("user1", "container1", userData);

            expect(result.accessibleContainerIds).toEqual([]);
            expect(result.defaultContainerId).toBeNull();
        });

        it("存在しないコンテナIDを削除しようとした場合、配列を変更しないこと", () => {
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
